import logging
import os
import json
import requests
from ultralytics import YOLO
import torch
import torchvision.models as models
import torchvision.transforms as transforms
from PIL import Image

logger = logging.getLogger("scene_stealer.vision")

class VisionService:
    def __init__(self, model_name="yolov8x.pt"):
        # 1. Load YOLOv8x (Extra Large) for Object Detection
        try:
            self.detector = YOLO(model_name)
            logger.info(f"{model_name} loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            raise

        # 2. Load EfficientNet V2 Medium for Scene/Image Classification
        try:
            # EfficientNet V2 Medium is much more accurate than ResNet50
            weights = models.EfficientNet_V2_M_Weights.IMAGENET1K_V1
            self.classifier = models.efficientnet_v2_m(weights=weights)
            self.classifier.eval()
            logger.info("EfficientNet_V2_M loaded successfully.")
            
            # Load ImageNet Class labels
            self.labels_map = self._load_imagenet_labels()
            
            # Use model-specific transforms
            self.transform = weights.transforms()
            
        except Exception as e:
            logger.error(f"Failed to load Classification model: {e}")
            self.classifier = None

    def _load_imagenet_labels(self):
        labels_path = "imagenet_class_index.json"
        if not os.path.exists(labels_path):
            try:
                url = "https://s3.amazonaws.com/deep-learning-models/image-models/imagenet_class_index.json"
                response = requests.get(url)
                with open(labels_path, "wb") as f:
                    f.write(response.content)
            except Exception as e:
                logger.error(f"Failed to download ImageNet labels: {e}")
                return {}
        
        with open(labels_path, "r") as f:
            return json.load(f)

    def classify_image(self, image_path: str):
        if not self.classifier:
            return []
        
        try:
            img = Image.open(image_path).convert('RGB')
            img_t = self.transform(img)
            batch_t = torch.unsqueeze(img_t, 0)

            with torch.no_grad():
                out = self.classifier(batch_t)
            
            # Get top 10 probabilities (increased from 5)
            _, indices = torch.sort(out, descending=True)
            percentage = torch.nn.functional.softmax(out, dim=1)[0] * 100
            
            top_results = []
            for idx in indices[0][:10]:
                idx_int = idx.item()
                label = self.labels_map[str(idx_int)][1]
                score = percentage[idx].item()
                
                logger.info(f"Class: {label}, Score: {score:.2f}%")

                # Filter low confidence scene tags (raised to 15% to reduce noise)
                if score > 15.0: 
                    clean_label = label.replace('_', ' ')
                    top_results.append(clean_label)
            
            logger.info(f"Classification Results: {top_results}")
            return top_results
        except Exception as e:
            logger.error(f"Error during classification: {e}")
            return []

    def detect_objects(self, image_path: str):
        unique_tags = set()

        # 1. Run YOLO Detection (lower conf to 0.1 for max recall)
        try:
            results = self.detector(image_path, conf=0.1)
            names = self.detector.names
            yolo_tags = []
            for r in results:
                for c in r.boxes.cls:
                    tag = names[int(c)]
                    unique_tags.add(tag)
                    yolo_tags.append(tag)
            logger.info(f"YOLO Raw Detections: {yolo_tags}")
        except Exception as e:
            logger.error(f"Error during object detection: {e}")

        # 2. Run Classification
        scene_tags = self.classify_image(image_path)
        unique_tags.update(scene_tags)

        # Convert to list
        final_tags = list(unique_tags)
        logger.info(f"Combined Detected Tags: {final_tags}")
        return final_tags
