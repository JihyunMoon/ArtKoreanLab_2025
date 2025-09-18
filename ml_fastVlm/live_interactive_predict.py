#
# Live interactive camera prediction script for FastVLM
# Features command-line style prompt input while camera is running
#
import os
import argparse
import time
import threading
import queue
import sys
import select
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


class LiveInteractivePredictor:
    def __init__(self, args):
        self.args = args
        self.model = None
        self.tokenizer = None
        self.image_processor = None
        self.context_len = None
        self.frame_queue = queue.Queue(maxsize=2)
        self.result_queue = queue.Queue()
        self.prompt_queue = queue.Queue()
        self.running = False
        self.last_inference_time = 0
        self.current_prompt = args.prompt
        self.processing = False
        self.quiet_mode = args.quiet if hasattr(args, 'quiet') else False
        
        # Terminal input handling
        self.input_buffer = ""
        self.command_history = []
        self.history_index = -1
        
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
                # Check for new prompt
                try:
                    while not self.prompt_queue.empty():
                        self.current_prompt = self.prompt_queue.get_nowait()
                        if not self.quiet_mode:
                            print(f"\n🔄 Prompt updated: {self.current_prompt}")
                            self.print_prompt()
                except queue.Empty:
                    pass
                
                # Get frame from queue
                frame, timestamp = self.frame_queue.get(timeout=0.1)
                
                # Skip if frame is too old
                current_time = time.time()
                if current_time - timestamp > 1.0:
                    continue
                
                self.processing = True
                
                # Convert frame to PIL Image
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
                
                self.processing = False
                
            except queue.Empty:
                continue
            except Exception as e:
                print(f"\n❌ Inference error: {e}")
                self.processing = False
                continue
    
    def input_worker(self):
        """Worker thread for handling terminal input"""
        while self.running:
            try:
                # Check if input is available
                if sys.stdin in select.select([sys.stdin], [], [], 0.1)[0]:
                    line = sys.stdin.readline()
                    if line:
                        command = line.strip()
                        if command:
                            self.handle_command(command)
                            self.print_prompt()
            except Exception as e:
                if self.running:
                    print(f"\n❌ Input error: {e}")
                break
    
    def handle_command(self, command):
        """Handle terminal commands"""
        # Add to history
        if command not in self.command_history:
            self.command_history.append(command)
        
        # Handle special commands
        if command.startswith('/'):
            self.handle_special_command(command)
        else:
            # Treat as prompt
            self.prompt_queue.put(command)
    
    def handle_special_command(self, command):
        """Handle special commands starting with /"""
        cmd = command.lower()
        
        if cmd == '/help' or cmd == '/h':
            self.show_help()
        elif cmd == '/quit' or cmd == '/q':
            print("\n👋 Shutting down...")
            self.running = False
        elif cmd == '/status' or cmd == '/s':
            self.show_status()
        elif cmd == '/history':
            self.show_history()
        elif cmd == '/clear':
            self.clear_history()
        elif cmd.startswith('/save '):
            filename = cmd[6:].strip()
            self.save_frame(filename)
        elif cmd == '/presets':
            self.show_presets()
        elif cmd.startswith('/preset '):
            try:
                preset_num = int(cmd[8:].strip())
                self.use_preset(preset_num)
            except ValueError:
                print(f"\n❌ Invalid preset number. Use /presets to see available options.")
        else:
            print(f"\n❌ Unknown command: {command}. Type /help for available commands.")
    
    def show_help(self):
        """Show help information"""
        print("\n" + "="*60)
        print("🚀 FASTVLM LIVE INTERACTIVE CAMERA")
        print("="*60)
        print("COMMANDS:")
        print("  Type any text        → Set as new prompt")
        print("  /help, /h           → Show this help")
        print("  /quit, /q           → Quit application")
        print("  /status, /s         → Show current status")
        print("  /history            → Show prompt history")
        print("  /clear              → Clear prompt history")
        print("  /presets            → Show preset prompts")
        print("  /preset <num>       → Use preset prompt")
        print("  /save <filename>    → Save current frame")
        print("\nEXAMPLES:")
        print("  Describe this image in detail")
        print("  What objects do you see?")
        print("  Count the people")
        print("  /preset 1")
        print("  /save my_capture.jpg")
        print("="*60 + "\n")
    
    def show_status(self):
        """Show current status"""
        status = "🔄 Processing" if self.processing else "⏸️ Idle"
        print(f"\n📊 STATUS:")
        print(f"  Model: {self.args.model_path}")
        print(f"  Current prompt: {self.current_prompt}")
        print(f"  Processing: {status}")
        print(f"  Commands in history: {len(self.command_history)}")
        print()
    
    def show_history(self):
        """Show command history"""
        print(f"\n📚 PROMPT HISTORY ({len(self.command_history)} items):")
        for i, cmd in enumerate(self.command_history[-10:], 1):  # Show last 10
            print(f"  {i:2d}. {cmd}")
        if len(self.command_history) > 10:
            print(f"  ... and {len(self.command_history) - 10} more")
        print()
    
    def clear_history(self):
        """Clear command history"""
        self.command_history.clear()
        print("\n🗑️ Command history cleared.\n")
    
    def show_presets(self):
        """Show preset prompts"""
        presets = [
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
        
        print(f"\n🎯 PRESET PROMPTS:")
        for i, preset in enumerate(presets, 1):
            print(f"  {i:2d}. {preset}")
        print(f"\nUse '/preset <number>' to select a preset.")
        print()
    
    def use_preset(self, preset_num):
        """Use a preset prompt"""
        presets = [
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
        
        if 1 <= preset_num <= len(presets):
            prompt = presets[preset_num - 1]
            self.prompt_queue.put(prompt)
            print(f"\n✅ Using preset {preset_num}: {prompt}")
        else:
            print(f"\n❌ Preset {preset_num} not found. Valid range: 1-{len(presets)}")
    
    def save_frame(self, filename):
        """Save the current frame"""
        # This would need access to the current frame - simplified for now
        print(f"\n💾 Frame save requested: {filename}")
    
    def print_prompt(self):
        """Print the current prompt line"""
        sys.stdout.write(f"\n📝 [{self.current_prompt[:50]}{'...' if len(self.current_prompt) > 50 else ''}] > ")
        sys.stdout.flush()
    
    def run_live_prediction(self):
        """Main loop for live camera prediction"""
        print("\n🎥 Starting FastVLM Live Interactive Camera...")
        print("Type '/help' for commands or just type prompts directly!")
        
        # Initialize camera
        cap = cv2.VideoCapture(self.args.camera_id)
        if not cap.isOpened():
            print(f"❌ Error: Could not open camera {self.args.camera_id}")
            return
        
        # Set camera properties
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.args.width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.args.height)
        cap.set(cv2.CAP_PROP_FPS, self.args.fps)
        
        # Start worker threads
        self.running = True
        inference_thread = threading.Thread(target=self.inference_worker, daemon=True)
        input_thread = threading.Thread(target=self.input_worker, daemon=True)
        
        inference_thread.start()
        input_thread.start()
        
        # Main camera loop
        current_result = "Starting up... Type a prompt!"
        last_inference_time = 0
        frame_count = 0
        last_frame_for_save = None
        
        self.print_prompt()
        
        try:
            while self.running:
                ret, frame = cap.read()
                if not ret:
                    print("\n❌ Error: Could not read frame from camera")
                    break
                
                last_frame_for_save = frame.copy()
                frame_count += 1
                current_time = time.time()
                
                # Add frame to inference queue
                if current_time - self.last_inference_time >= self.args.inference_interval:
                    if not self.frame_queue.full():
                        self.frame_queue.put((frame.copy(), current_time))
                        self.last_inference_time = current_time
                
                # Check for new results
                try:
                    while not self.result_queue.empty():
                        result = self.result_queue.get_nowait()
                        current_result = result['text']
                        last_inference_time = result['inference_time']
                        
                        # Print result (respecting quiet mode)
                        if not self.quiet_mode or frame_count % 60 == 0:  # Less frequent in quiet mode
                            print(f"\n🤖 [{datetime.now().strftime('%H:%M:%S')}] ({last_inference_time:.2f}s)")
                            print(f"📄 {current_result}")
                            if not self.quiet_mode:
                                self.print_prompt()
                        
                except queue.Empty:
                    pass
                
                # Create display frame
                display_frame = frame.copy()
                self.add_overlay(display_frame, current_result, last_inference_time)
                
                # Show frame
                cv2.imshow('FastVLM Live Interactive', display_frame)
                
                # Check for window close or ESC key
                key = cv2.waitKey(1) & 0xFF
                if key == 27:  # ESC key
                    break
                
                # Small delay to prevent excessive CPU usage
                time.sleep(0.01)
        
        except KeyboardInterrupt:
            print("\n\n⏹️ Interrupted by user")
        
        finally:
            # Cleanup
            self.running = False
            cap.release()
            cv2.destroyAllWindows()
            print("\n👋 FastVLM Live Interactive stopped")
    
    def add_overlay(self, frame, result_text, inference_time):
        """Add text overlay to the frame"""
        height, width = frame.shape[:2]
        
        # Create semi-transparent overlay
        overlay = frame.copy()
        
        # Text settings
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.6
        thickness = 1
        color = (255, 255, 255)
        bg_color = (0, 0, 0)
        
        # Status
        status = "🔄 Processing" if self.processing else "✅ Ready"
        cv2.putText(overlay, status, (10, 30), font, font_scale, (0, 255, 0), thickness)
        
        # Inference time
        if inference_time > 0:
            cv2.putText(overlay, f"Time: {inference_time:.2f}s", (10, 60), font, font_scale, color, thickness)
        
        # Current prompt (truncated)
        prompt_display = self.current_prompt[:80] + "..." if len(self.current_prompt) > 80 else self.current_prompt
        cv2.putText(overlay, f"Prompt: {prompt_display}", (10, 90), font, font_scale, (0, 255, 255), thickness)
        
        # Result text (bottom overlay with background)
        if result_text and result_text != "Starting up... Type a prompt!":
            # Word wrap
            lines = self.wrap_text(result_text, font, font_scale, thickness, width - 20)
            if lines:
                # Background rectangle
                text_height = len(lines) * 25 + 20
                cv2.rectangle(overlay, (5, height - text_height - 10), (width - 5, height - 5), bg_color, -1)
                
                # Text
                for i, line in enumerate(lines[-4:]):  # Show last 4 lines
                    y_pos = height - text_height + i * 25 + 15
                    cv2.putText(overlay, line, (10, y_pos), font, font_scale, color, thickness)
        
        # Blend overlay
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
                    lines.append(word)
        
        if current_line:
            lines.append(' '.join(current_line))
        
        return lines


def main():
    parser = argparse.ArgumentParser(description="Live interactive camera prediction with FastVLM")
    
    # Model arguments
    parser.add_argument("--model-path", type=str, required=True,
                       help="Path to FastVLM model checkpoint")
    parser.add_argument("--model-base", type=str, default=None,
                       help="Base model path")
    parser.add_argument("--conv-mode", type=str, default="qwen_2",
                       help="Conversation mode")
    
    # Generation arguments
    parser.add_argument("--prompt", type=str, default="Describe what you see.",
                       help="Initial prompt for the vision model")
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
                       help="Camera device ID")
    parser.add_argument("--width", type=int, default=640,
                       help="Camera frame width")
    parser.add_argument("--height", type=int, default=480,
                       help="Camera frame height")
    parser.add_argument("--fps", type=int, default=30,
                       help="Camera FPS")
    
    # Performance arguments
    parser.add_argument("--inference-interval", type=float, default=2.0,
                       help="Minimum interval between inferences (seconds)")
    parser.add_argument("--quiet", action="store_true",
                       help="Reduce log output for easier typing")
    
    args = parser.parse_args()
    
    # Validate model path
    if not os.path.exists(args.model_path):
        print(f"❌ Error: Model path does not exist: {args.model_path}")
        return
    
    try:
        predictor = LiveInteractivePredictor(args)
        predictor.run_live_prediction()
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()