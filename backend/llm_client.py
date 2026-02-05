import requests
import logging
import os
import json
import time
import base64
from io import BytesIO
from PIL import Image

logger = logging.getLogger("cinestealr.llm")

LLM_API_URL = os.getenv("LLM_API_URL", "http://localhost:8080/v1/chat/completions")

class LLMService:
    def encode_image(self, image_path):
        """Encodes an image to base64, resizing it for performance."""
        try:
            with Image.open(image_path) as img:
                # Resize image if it's too large (max dimension 672px)
                max_size = 672
                if max(img.size) > max_size:
                    img.thumbnail((max_size, max_size))
                
                # Convert to RGB if necessary (e.g. for PNGs with alpha)
                if img.mode != 'RGB':
                    img = img.convert('RGB')

                buffered = BytesIO()
                img.save(buffered, format="JPEG", quality=85)
                return base64.b64encode(buffered.getvalue()).decode('utf-8')
        except Exception as e:
            logger.error(f"Error encoding image {image_path}: {e}")
            raise

    def generate_description_stream(self, image_path, media_type="image"):
        try:
            base64_image = self.encode_image(image_path)
        except Exception as e:
            logger.error(f"Failed to encode image: {e}")
            yield f"[Error reading image: {e}]"
            return

        if media_type == "movie":
            prompt_text = (
                "Describe this movie scene in detail. Focus on the composition, lighting, "
                "character interactions, and the overall mood. Write it like a screenplay description."
            )
            system_role = "You are a film critic."
        else:
            prompt_text = (
                "Describe this image in detail. Be literal and precise. "
                "Mention the people, the background, and the action taking place."
            )
            system_role = "You are a helpful assistant."

        payload = {
            "messages": [
                {
                    "role": "user", 
                    "content": [
                        {"type": "text", "text": prompt_text},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            "temperature": 0.5, 
            "max_tokens": 300, 
            "stream": True
        }

        # Retry logic for 503 (Model Loading) errors
        max_retries = 10
        retry_delay = 5

        for attempt in range(max_retries):
            try:
                logger.info(f"Starting LLaVA stream for image: {image_path} (Attempt {attempt + 1})")
                with requests.post(LLM_API_URL, json=payload, stream=True, timeout=300) as response:
                    if response.status_code == 503:
                        logger.warning("LLM Service Unavailable, retrying...")
                        time.sleep(retry_delay)
                        continue
                    
                    response.raise_for_status()
                    for line in response.iter_lines():
                        if line:
                            line = line.decode('utf-8')
                            if line.startswith("data: "):
                                data_str = line[6:]
                                if data_str == "[DONE]":
                                    break
                                try:
                                    data = json.loads(data_str)
                                    # LLaVA/llama.cpp might return content in different fields sometimes, but usually standard
                                    delta = data['choices'][0]['delta']
                                    if 'content' in delta and delta['content']:
                                        yield delta['content']
                                except json.JSONDecodeError:
                                    continue
                return 
            except requests.exceptions.RequestException as e:
                logger.error(f"LLM request error: {e}")
                if attempt == max_retries - 1:
                    yield f"\n[Error: Connection to LLM failed.]"
                time.sleep(retry_delay)
            except Exception as e:
                logger.error(f"LLM unexpected error: {e}")
                yield f"\n[Error: {e}]"
                break

    def generate_image_prompt_stream(self, description: str, tags: str):
        """Generate an image generation prompt from a scene description."""
        
        prompt_text = f"""Based on this scene description and detected elements, create an image generation prompt.

Focus on:
- Visual style and artistic aesthetic
- Composition and framing
- Lighting and atmosphere
- Color palette
- Main subject with detailed context
- Add style keywords suitable for AI image generators (e.g., "cinematic", "4k", "detailed")

Scene Description: {description}

Detected Elements: {tags}

Generate a concise, detailed prompt (under 200 words) that would recreate this image style. Output ONLY the prompt, no explanations."""

        payload = {
            "messages": [
                {
                    "role": "system",
                    "content": "You are an expert at creating prompts for AI image generators like Stable Diffusion, DALL-E, and Midjourney. Your prompts are detailed, artistic, and capture the essence of scenes."
                },
                {
                    "role": "user",
                    "content": prompt_text
                }
            ],
            "temperature": 0.7,
            "max_tokens": 400,
            "stream": True
        }

        try:
            logger.info("Starting image prompt generation from description")
            with requests.post(LLM_API_URL, json=payload, stream=True, timeout=120) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if line:
                        line = line.decode('utf-8')
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                data = json.loads(data_str)
                                delta = data['choices'][0]['delta']
                                if 'content' in delta and delta['content']:
                                    yield delta['content']
                            except json.JSONDecodeError:
                                continue
        except requests.exceptions.RequestException as e:
            logger.error(f"Image prompt generation error: {e}")
            yield f"[Error: Failed to generate prompt - {e}]"
        except Exception as e:
            logger.error(f"Unexpected error in prompt generation: {e}")
            yield f"[Error: {e}]"