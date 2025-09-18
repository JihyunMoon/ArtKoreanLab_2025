#
# Live camera prediction script for FastVLM
# Based on predict.py with added OpenCV camera integration
#
import os
import argparse
import time
import threading
import queue
from datetime import datetime

import torch
import cv2
import numpy as np
from PIL import Image

from llava.utils import disable_torch_init
from llava.conversation import conv_templates
from llava.model.builder import load_pretrained_model
from llava.mm_utils import tokenizer_image_token, process_images, get_model_name_from_path
from llava.constants import IMAGE_TOKEN_INDEX, DEFAULT_IMAGE_TOKEN, DEFAULT_IM_START_TOKEN, DEFAULT_IM_END_TOKEN


class LiveCameraPredictor:
    def __init__(self, args):
        self.args = args
        self.model = None
        self.tokenizer = None
        self.image_processor = None
        self.context_len = None
        self.frame_queue = queue.Queue(maxsize=2)  # Limit queue size to prevent memory buildup
        self.result_queue = queue.Queue()
        self.running = False
        self.last_inference_time = 0
        self.fps_counter = 0
        self.fps_start_time = time.time()
        self.current_prompt = args.prompt
        self.prompt_history = [args.prompt]
        self.prompt_presets = [
            "Describe what you see in detail.",
            "What objects can you identify in this image?",
            "Describe the scene and any people or activities.",
            "What colors and textures do you observe?",
            "Count the number of people in the image.",
            "What is the main focus of this image?",
            "Describe the lighting and mood of the scene.",
            "What text or signs can you read in the image?",
            "What emotions or expressions do you see?",
            "Analyze the composition and layout of this image."
        ]
        
        self.load_model()
        
    def load_model(self):
        """Load the FastVLM model"""
        print("Loading FastVLM model...")
        model_path = os.path.expanduser(self.args.model_path)
        
        # Handle generation config
        generation_config = None
        if os.path.exists(os.path.join(model_path, 'generation_config.json')):
            generation_config = os.path.join(model_path, '.generation_config.json')
            os.rename(os.path.join(model_path, 'generation_config.json'), generation_config)
        
        # Load model
        disable_torch_init()
        model_name = get_model_name_from_path(model_path)
        self.tokenizer, self.model, self.image_processor, self.context_len = load_pretrained_model(
            model_path, self.args.model_base, model_name, device="mps"
        )
        
        # Set pad token id for generation
        self.model.generation_config.pad_token_id = self.tokenizer.pad_token_id
        
        # Restore generation config
        if generation_config is not None:
            os.rename(generation_config, os.path.join(model_path, 'generation_config.json'))
            
        print("Model loaded successfully!")
        
    def prepare_prompt(self, prompt_text):
        """Prepare the conversation prompt"""
        qs = prompt_text
        if self.model.config.mm_use_im_start_end:
            qs = DEFAULT_IM_START_TOKEN + DEFAULT_IMAGE_TOKEN + DEFAULT_IM_END_TOKEN + '\n' + qs
        else:
            qs = DEFAULT_IMAGE_TOKEN + '\n' + qs
            
        conv = conv_templates[self.args.conv_mode].copy()
        conv.append_message(conv.roles[0], qs)
        conv.append_message(conv.roles[1], None)
        prompt = conv.get_prompt()
        
        # Tokenize prompt
        input_ids = tokenizer_image_token(
            prompt, self.tokenizer, IMAGE_TOKEN_INDEX, return_tensors='pt'
        ).unsqueeze(0).to(torch.device("mps"))
        
        return input_ids
    
    def inference_worker(self):
        """Worker thread for running inference on frames"""
        while self.running:
            try:
                # Get frame from queue (with timeout to allow checking self.running)
                frame, timestamp = self.frame_queue.get(timeout=0.1)
                
                # Skip if this frame is too old (avoid processing backlog)
                current_time = time.time()
                if current_time - timestamp > 1.0:  # Skip frames older than 1 second
                    continue
                    
                # Convert OpenCV frame (BGR) to PIL Image (RGB)
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_image = Image.fromarray(rgb_frame)
                
                # Process image
                image_tensor = process_images([pil_image], self.image_processor, self.model.config)[0]
                
                # Prepare input
                input_ids = self.prepare_prompt(self.current_prompt)
                
                # Run inference
                start_time = time.time()
                with torch.inference_mode():
                    output_ids = self.model.generate(
                        input_ids,
                        images=image_tensor.unsqueeze(0).half(),
                        image_sizes=[pil_image.size],
                        do_sample=True if self.args.temperature > 0 else False,
                        temperature=self.args.temperature,
                        top_p=self.args.top_p,
                        num_beams=self.args.num_beams,
                        max_new_tokens=self.args.max_tokens,
                        use_cache=True
                    )
                
                # Decode output
                output_text = self.tokenizer.batch_decode(output_ids, skip_special_tokens=True)[0].strip()
                inference_time = time.time() - start_time
                
                # Put result in queue
                self.result_queue.put({
                    'text': output_text,
                    'inference_time': inference_time,
                    'timestamp': timestamp
                })
                
            except queue.Empty:
                continue
            except Exception as e:
                print(f"Inference error: {e}")
                continue
    
    def run_live_prediction(self):
        """Main loop for live camera prediction"""
        print("Starting live camera prediction...")
        print("Controls:")
        print("  'q' - Quit")
        print("  'p' - Pause/Resume inference")
        print("  's' - Save current frame")
        print("  'c' - Change prompt (custom)")
        print("  '1-9' - Use preset prompts")
        print("  'h' - Show prompt history")
        print("  'r' - Reset to original prompt")
        print("  '?' - Show this help again")
        
        # Initialize camera
        cap = cv2.VideoCapture(self.args.camera_id)
        if not cap.isOpened():
            print(f"Error: Could not open camera {self.args.camera_id}")
            return
        
        # Set camera properties
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.args.width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.args.height)
        cap.set(cv2.CAP_PROP_FPS, self.args.fps)
        
        # Start inference worker thread
        self.running = True
        inference_thread = threading.Thread(target=self.inference_worker, daemon=True)
        inference_thread.start()
        
        # Main display loop
        current_result = "Initializing..."
        last_inference_time = 0
        paused = False
        frame_count = 0
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    print("Error: Could not read frame from camera")
                    break
                
                frame_count += 1
                current_time = time.time()
                
                # Calculate FPS
                if frame_count % 30 == 0:  # Update every 30 frames
                    elapsed = current_time - self.fps_start_time
                    if elapsed > 0:
                        display_fps = 30 / elapsed
                        self.fps_start_time = current_time
                
                # Add frame to inference queue (if not paused and enough time has passed)
                if not paused and current_time - self.last_inference_time >= self.args.inference_interval:
                    if not self.frame_queue.full():
                        self.frame_queue.put((frame.copy(), current_time))
                        self.last_inference_time = current_time
                
                # Check for new inference results
                try:
                    while not self.result_queue.empty():
                        result = self.result_queue.get_nowait()
                        current_result = result['text']
                        last_inference_time = result['inference_time']
                        if self.args.verbose:
                            print(f"[{datetime.now().strftime('%H:%M:%S')}] Inference time: {last_inference_time:.2f}s")
                            print(f"Result: {current_result}")
                            print("-" * 50)
                except queue.Empty:
                    pass
                
                # Create display frame
                display_frame = frame.copy()
                
                # Add text overlay
                self.add_text_overlay(display_frame, current_result, last_inference_time, paused)
                
                # Show frame
                cv2.imshow('FastVLM Live Camera', display_frame)
                
                # Handle keyboard input
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    break
                elif key == ord('p'):
                    paused = not paused
                    print(f"{'Paused' if paused else 'Resumed'}")
                elif key == ord('s'):
                    # Save current frame
                    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                    filename = f"captured_frame_{timestamp}.jpg"
                    cv2.imwrite(filename, frame)
                    print(f"Saved frame: {filename}")
                elif key == ord('c'):
                    # Change prompt (custom)
                    self.change_prompt_interactive()
                elif key == ord('h'):
                    # Show prompt history
                    self.show_prompt_history()
                elif key == ord('r'):
                    # Reset to original prompt
                    self.current_prompt = self.args.prompt
                    print(f"Reset to original prompt: {self.current_prompt}")
                elif key == ord('?'):
                    # Show help
                    self.show_help()
                elif key >= ord('1') and key <= ord('9'):
                    # Use preset prompt
                    preset_idx = key - ord('1')
                    if preset_idx < len(self.prompt_presets):
                        self.current_prompt = self.prompt_presets[preset_idx]
                        if self.current_prompt not in self.prompt_history:
                            self.prompt_history.append(self.current_prompt)
                        print(f"Changed to preset prompt {preset_idx + 1}: {self.current_prompt}")
        
        except KeyboardInterrupt:
            print("\nInterrupted by user")
        
        finally:
            # Cleanup
            self.running = False
            cap.release()
            cv2.destroyAllWindows()
            print("Camera prediction stopped")
    
    def add_text_overlay(self, frame, result_text, inference_time, paused):
        """Add text overlay to the frame"""
        # Frame dimensions
        height, width = frame.shape[:2]
        
        # Create semi-transparent overlay
        overlay = frame.copy()
        
        # Text settings
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.6
        thickness = 1
        color = (255, 255, 255)
        bg_color = (0, 0, 0)
        
        # Status text
        status = "PAUSED" if paused else "RUNNING"
        status_color = (0, 255, 255) if paused else (0, 255, 0)
        
        # Add status
        cv2.putText(overlay, f"Status: {status}", (10, 30), font, font_scale, status_color, thickness + 1)
        
        # Add inference time
        if inference_time > 0:
            cv2.putText(overlay, f"Inference: {inference_time:.2f}s", (10, 60), font, font_scale, color, thickness)
        
        # Add current prompt (truncated if too long)
        prompt_display = self.current_prompt
        if len(prompt_display) > 60:
            prompt_display = prompt_display[:57] + "..."
        cv2.putText(overlay, f"Prompt: {prompt_display}", (10, 90), font, font_scale, color, thickness)
        
        # Add result text (word wrap)
        y_offset = height - 150
        max_width = width - 20
        lines = self.wrap_text(result_text, font, font_scale, thickness, max_width)
        
        # Background rectangle for result text
        if lines:
            text_height = len(lines) * 25 + 20
            cv2.rectangle(overlay, (5, y_offset - 10), (width - 5, height - 5), bg_color, -1)
        
        # Draw wrapped text
        for i, line in enumerate(lines):
            y_pos = y_offset + i * 25
            if y_pos < height - 10:
                cv2.putText(overlay, line, (10, y_pos), font, font_scale, color, thickness)
        
        # Blend overlay with original frame
        cv2.addWeighted(overlay, 0.8, frame, 0.2, 0, frame)
    
    def wrap_text(self, text, font, font_scale, thickness, max_width):
        """Wrap text to fit within specified width"""
        words = text.split()
        lines = []
        current_line = []
        
        for word in words:
            test_line = ' '.join(current_line + [word])
            (text_width, _), _ = cv2.getTextSize(test_line, font, font_scale, thickness)
            
            if text_width <= max_width:
                current_line.append(word)
            else:
                if current_line:
                    lines.append(' '.join(current_line))
                    current_line = [word]
                else:
                    # Single word too long, just add it
                    lines.append(word)
        
        if current_line:
            lines.append(' '.join(current_line))
        
        return lines[-4:]  # Limit to 4 lines
    
    def change_prompt_interactive(self):
        """Interactive prompt change via terminal input"""
        print("\n" + "="*50)
        print("INTERACTIVE PROMPT CHANGE")
        print("Current prompt:", self.current_prompt)
        print("\nPreset prompts:")
        for i, preset in enumerate(self.prompt_presets, 1):
            print(f"  {i}. {preset}")
        print("\nEnter new prompt (or press Enter to keep current):")
        
        try:
            new_prompt = input("> ").strip()
            if new_prompt:
                self.current_prompt = new_prompt
                if new_prompt not in self.prompt_history:
                    self.prompt_history.append(new_prompt)
                print(f"Prompt changed to: {self.current_prompt}")
            else:
                print("Keeping current prompt.")
        except (EOFError, KeyboardInterrupt):
            print("\nPrompt change cancelled.")
        
        print("="*50 + "\n")
        print("Focus back on camera window and press any key to continue...")
    
    def show_prompt_history(self):
        """Show prompt history"""
        print("\n" + "="*50)
        print("PROMPT HISTORY")
        for i, prompt in enumerate(self.prompt_history, 1):
            marker = " <- CURRENT" if prompt == self.current_prompt else ""
            print(f"  {i}. {prompt}{marker}")
        print("\nTo use a prompt from history, press 'c' and enter the number.")
        print("="*50 + "\n")
    
    def show_help(self):
        """Show help information"""
        print("\n" + "="*50)
        print("FASTVLM LIVE CAMERA - CONTROLS")
        print("  'q' - Quit application")
        print("  'p' - Pause/Resume inference")
        print("  's' - Save current frame to file")
        print("  'c' - Change prompt (interactive mode)")
        print("  '1-9' - Use preset prompts (quick select)")
        print("  'h' - Show prompt history")
        print("  'r' - Reset to original prompt")
        print("  '?' - Show this help")
        print("\nPreset Prompts:")
        for i, preset in enumerate(self.prompt_presets, 1):
            if i <= 9:
                print(f"  {i}. {preset}")
        print("="*50 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Live camera prediction with FastVLM")
    
    # Model arguments
    parser.add_argument("--model-path", type=str, required=True, 
                       help="Path to FastVLM model checkpoint")
    parser.add_argument("--model-base", type=str, default=None,
                       help="Base model path")
    parser.add_argument("--conv-mode", type=str, default="qwen_2",
                       help="Conversation mode")
    
    # Generation arguments
    parser.add_argument("--prompt", type=str, default="Describe what you see in detail.",
                       help="Prompt for the vision model")
    parser.add_argument("--temperature", type=float, default=0.2,
                       help="Generation temperature")
    parser.add_argument("--top_p", type=float, default=None,
                       help="Top-p sampling parameter")
    parser.add_argument("--num_beams", type=int, default=1,
                       help="Number of beams for beam search")
    parser.add_argument("--max_tokens", type=int, default=128,
                       help="Maximum number of tokens to generate")
    
    # Camera arguments
    parser.add_argument("--camera-id", type=int, default=0,
                       help="Camera device ID (usually 0 for default camera)")
    parser.add_argument("--width", type=int, default=640,
                       help="Camera frame width")
    parser.add_argument("--height", type=int, default=480,
                       help="Camera frame height")
    parser.add_argument("--fps", type=int, default=30,
                       help="Camera FPS")
    
    # Performance arguments
    parser.add_argument("--inference-interval", type=float, default=2.0,
                       help="Minimum interval between inferences (seconds)")
    parser.add_argument("--verbose", action="store_true",
                       help="Print detailed output")
    
    args = parser.parse_args()
    
    # Validate model path
    if not os.path.exists(args.model_path):
        print(f"Error: Model path does not exist: {args.model_path}")
        return
    
    try:
        predictor = LiveCameraPredictor(args)
        predictor.run_live_prediction()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()