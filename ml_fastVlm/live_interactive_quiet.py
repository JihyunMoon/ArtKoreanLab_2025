#!/usr/bin/env python3
#
# Quiet Live Interactive Camera Prediction Script for FastVLM
# Minimal logging version for easier typing experience
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


class QuietLivePredictor:
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
        self.last_result = "Ready to start..."
        
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
        print("=" * 50)
        print("🎥 QUIET MODE ACTIVE")
        print("Commands:")
        print("  Type text + ENTER = new prompt")
        print("  /help = show help")
        print("  /quit = exit")
        print("  /result = show last result")
        print("=" * 50)
        
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
                        print(f"\n✅ New prompt: {self.current_prompt}")
                        self.show_input_prompt()
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
                
                # Store result
                self.last_result = output_text
                
                # Put result in queue (only for display)
                self.result_queue.put({
                    'text': output_text,
                    'inference_time': inference_time,
                    'timestamp': timestamp
                })
                
                self.processing = False
                
            except queue.Empty:
                continue
            except Exception as e:
                print(f"\n❌ Error: {e}")
                self.processing = False
                continue
    
    def input_worker(self):
        """Worker thread for handling terminal input"""
        while self.running:
            try:
                # Simple blocking input - cleaner than select
                line = input()
                if line.strip():
                    self.handle_command(line.strip())
            except EOFError:
                self.running = False
                break
            except Exception as e:
                if self.running:
                    print(f"\n❌ Input error: {e}")
                break
    
    def handle_command(self, command):
        """Handle terminal commands"""
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
        elif cmd == '/result' or cmd == '/r':
            print(f"\n📄 Last result:\n{self.last_result}")
            self.show_input_prompt()
        elif cmd == '/status' or cmd == '/s':
            self.show_status()
        else:
            print(f"\n❌ Unknown command: {command}")
            self.show_input_prompt()
    
    def show_help(self):
        """Show help information"""
        print("\n" + "="*40)
        print("🎥 FASTVLM QUIET MODE HELP")
        print("="*40)
        print("Commands:")
        print("  Type any text + ENTER → Set new prompt")
        print("  /help, /h           → Show this help")
        print("  /quit, /q           → Quit")
        print("  /result, /r         → Show last result")
        print("  /status, /s         → Show status")
        print("\nExamples:")
        print("  What do you see?")
        print("  Count the people")
        print("  Describe the scene")
        print("="*40)
        self.show_input_prompt()
    
    def show_status(self):
        """Show current status"""
        status = "🔄 Processing" if self.processing else "✅ Ready"
        print(f"\n📊 STATUS:")
        print(f"  Current prompt: {self.current_prompt}")
        print(f"  Status: {status}")
        print(f"  Last result length: {len(self.last_result)} chars")
        self.show_input_prompt()
    
    def show_input_prompt(self):
        """Show clean input prompt"""
        print(f"\n💬 [{self.current_prompt[:30]}{'...' if len(self.current_prompt) > 30 else ''}] > ", end='', flush=True)
    
    def run_live_prediction(self):
        """Main loop for live camera prediction"""
        print(f"\n🎥 Starting camera {self.args.camera_id}...")
        
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
        
        # Show initial prompt
        self.show_input_prompt()
        
        # Main camera loop (minimal output)
        frame_count = 0
        
        try:
            while self.running:
                ret, frame = cap.read()
                if not ret:
                    print("\n❌ Error: Could not read frame from camera")
                    break
                
                frame_count += 1
                current_time = time.time()
                
                # Add frame to inference queue
                if current_time - self.last_inference_time >= self.args.inference_interval:
                    if not self.frame_queue.full():
                        self.frame_queue.put((frame.copy(), current_time))
                        self.last_inference_time = current_time
                
                # Check for new results and display them
                try:
                    while not self.result_queue.empty():
                        result = self.result_queue.get_nowait()
                        # Display the result with timestamp and inference time
                        timestamp = datetime.fromtimestamp(result['timestamp']).strftime('%H:%M:%S')
                        print(f"\n\n🤖 [{timestamp}] ({result['inference_time']:.2f}s)")
                        print(f"📄 {result['text']}")
                        self.show_input_prompt()
                except queue.Empty:
                    pass
                
                # Create display frame with minimal overlay
                display_frame = frame.copy()
                self.add_minimal_overlay(display_frame)
                
                # Show frame
                cv2.imshow('FastVLM Quiet Mode', display_frame)
                
                # Check for window close or ESC key
                key = cv2.waitKey(1) & 0xFF
                if key == 27:  # ESC key
                    break
                
                # Small delay
                time.sleep(0.01)
        
        except KeyboardInterrupt:
            print("\n\n⏹️ Interrupted by user")
        
        finally:
            # Cleanup
            self.running = False
            cap.release()
            cv2.destroyAllWindows()
            print("\n👋 FastVLM Quiet Mode stopped")
    
    def add_minimal_overlay(self, frame):
        """Add minimal text overlay to the frame"""
        height, width = frame.shape[:2]
        
        # Text settings
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.5
        thickness = 1
        color = (255, 255, 255)
        
        # Just show processing status
        status = "🔄" if self.processing else "✅"
        cv2.putText(frame, status, (10, 25), font, font_scale, (0, 255, 0) if not self.processing else (0, 255, 255), thickness)
        
        # Current prompt (very short)
        prompt_short = self.current_prompt[:50] + "..." if len(self.current_prompt) > 50 else self.current_prompt
        cv2.putText(frame, prompt_short, (10, height - 15), font, font_scale * 0.7, (255, 255, 0), thickness)


def main():
    parser = argparse.ArgumentParser(description="Quiet live interactive camera prediction with FastVLM")
    
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
    
    args = parser.parse_args()
    
    # Validate model path
    if not os.path.exists(args.model_path):
        print(f"❌ Error: Model path does not exist: {args.model_path}")
        return
    
    try:
        predictor = QuietLivePredictor(args)
        predictor.run_live_prediction()
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()