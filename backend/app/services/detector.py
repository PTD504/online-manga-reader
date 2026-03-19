"""YOLOv11 bubble detection service using ONNX Runtime."""

import logging
import os
from pathlib import Path
from typing import List, Dict, Optional, Tuple

import cv2
import numpy as np
import onnxruntime as ort

from app.services.polygon import extract_bubble_polygon

logger = logging.getLogger(__name__)

# Detection thresholds
CONF_THRESHOLD = 0.25
IOU_THRESHOLD = 0.45
INPUT_SIZE = 640

# Model path (relative to backend directory)
MODEL_PATH = Path(__file__).parent.parent.parent.parent / "models" / "best.onnx"


class BubbleDetector:
    """Singleton YOLO bubble detector."""
    
    _instance: Optional["BubbleDetector"] = None
    _initialized: bool = False
    _session: Optional[ort.InferenceSession] = None
    _input_name: str = ""
    _output_name: str = ""
    
    def __new__(cls) -> "BubbleDetector":
        """Return singleton instance."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self) -> None:
        """Initialize ONNX Runtime session."""
        if BubbleDetector._initialized:
            return
        
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"YOLO model not found at {MODEL_PATH}. "
                f"Please place 'best.onnx' in the 'models' directory."
            )
        
        logger.info(f"Loading YOLO model from {MODEL_PATH}...")
        
        # Configure ONNX Runtime session
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        
        # Use available providers (CUDA if available, otherwise CPU)
        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
        
        try:
            self._session = ort.InferenceSession(
                str(MODEL_PATH),
                sess_options=sess_options,
                providers=providers
            )
        except Exception:
            # Fallback to CPU only if CUDA fails
            logger.warning("CUDA not available, using CPU for inference")
            self._session = ort.InferenceSession(
                str(MODEL_PATH),
                sess_options=sess_options,
                providers=['CPUExecutionProvider']
            )
        
        # Get input/output names dynamically
        self._input_name = self._session.get_inputs()[0].name
        self._output_name = self._session.get_outputs()[0].name
        
        # Get input shape for validation
        input_shape = self._session.get_inputs()[0].shape
        logger.info(f"Model loaded. Input: {self._input_name} {input_shape}, Output: {self._output_name}")
        
        BubbleDetector._initialized = True
        logger.info("Bubble detector initialized successfully")
    
    def preprocess(self, image: np.ndarray) -> Tuple[np.ndarray, float, Tuple[float, float]]:
        """Preprocess image with letterbox resizing."""
        original_h, original_w = image.shape[:2]
        
        # Calculate scaling ratio while keeping aspect ratio.
        ratio = min(INPUT_SIZE / original_w, INPUT_SIZE / original_h)
        
        new_w = int(original_w * ratio)
        new_h = int(original_h * ratio)
        
        # Resize image
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        
        # Calculate padding to reach INPUT_SIZE x INPUT_SIZE.
        dw = (INPUT_SIZE - new_w) / 2
        dh = (INPUT_SIZE - new_h) / 2
        
        # Apply padding (letterbox with gray color 114)
        top = int(round(dh - 0.1))
        bottom = int(round(dh + 0.1))
        left = int(round(dw - 0.1))
        right = int(round(dw + 0.1))
        
        letterboxed = cv2.copyMakeBorder(
            resized, top, bottom, left, right,
            cv2.BORDER_CONSTANT, value=(114, 114, 114)
        )
        
        # Ensure exact size after rounding.
        if letterboxed.shape[0] != INPUT_SIZE or letterboxed.shape[1] != INPUT_SIZE:
            letterboxed = cv2.resize(letterboxed, (INPUT_SIZE, INPUT_SIZE))
        
        # Convert BGR to RGB
        rgb = cv2.cvtColor(letterboxed, cv2.COLOR_BGR2RGB)
        
        # Normalize to 0-1
        normalized = rgb.astype(np.float32) / 255.0
        
        # Transpose from (H, W, C) to (C, H, W)
        transposed = normalized.transpose(2, 0, 1)
        
        # Add batch dimension: (1, C, H, W)
        input_tensor = np.expand_dims(transposed, axis=0)
        
        # Ensure contiguous array
        input_tensor = np.ascontiguousarray(input_tensor)
        
        return input_tensor, ratio, (dw, dh)
    
    def postprocess(
        self,
        outputs: np.ndarray,
        ratio: float,
        dwdh: Tuple[float, float],
        original_shape: Tuple[int, int],
        original_image: np.ndarray
    ) -> List[Dict]:
        """Postprocess YOLO outputs with NMS and coordinate rescaling."""
        dw, dh = dwdh
        original_h, original_w = original_shape
        
        # Handle different output shapes.
        predictions = outputs[0]
        
        if predictions.shape[0] < predictions.shape[1]:
            predictions = predictions.T
        
        if predictions.shape[1] == 5:
            boxes = predictions[:, :4]
            scores = predictions[:, 4]
        else:
            boxes = predictions[:, :4]
            class_scores = predictions[:, 4:]
            scores = np.max(class_scores, axis=1)
        
        # Filter by confidence threshold
        mask = scores >= CONF_THRESHOLD
        boxes = boxes[mask]
        scores = scores[mask]
        
        if len(boxes) == 0:
            return []
        
        # Convert from center format (x, y, w, h) to corner format (x1, y1, x2, y2)
        x_center = boxes[:, 0]
        y_center = boxes[:, 1]
        width = boxes[:, 2]
        height = boxes[:, 3]
        
        x1 = x_center - width / 2
        y1 = y_center - height / 2
        x2 = x_center + width / 2
        y2 = y_center + height / 2
        
        boxes_xyxy = np.stack([x1, y1, x2, y2], axis=1)
        
        # Apply NMS in (x, y, w, h) format.
        boxes_xywh = np.stack([x1, y1, width, height], axis=1).tolist()
        scores_list = scores.tolist()
        
        indices = cv2.dnn.NMSBoxes(
            boxes_xywh,
            scores_list,
            CONF_THRESHOLD,
            IOU_THRESHOLD
        )
        
        if len(indices) == 0:
            return []
        
        if isinstance(indices, np.ndarray):
            indices = indices.flatten()
        else:
            indices = [i[0] if isinstance(i, (list, tuple)) else i for i in indices]
        
        results = []
        for idx in indices:
            bx1, by1, bx2, by2 = boxes_xyxy[idx]
            conf = float(scores[idx])
            
            bx1 = bx1 - dw
            by1 = by1 - dh
            bx2 = bx2 - dw
            by2 = by2 - dh
            
            bx1 = bx1 / ratio
            by1 = by1 / ratio
            bx2 = bx2 / ratio
            by2 = by2 / ratio
            
            bx1 = max(0, min(bx1, original_w))
            by1 = max(0, min(by1, original_h))
            bx2 = max(0, min(bx2, original_w))
            by2 = max(0, min(by2, original_h))
            
            if bx2 <= bx1 or by2 <= by1:
                logger.debug(f"Skipping invalid box with zero/negative dimensions: [{bx1}, {by1}, {bx2}, {by2}]")
                continue

            ix1, iy1, ix2, iy2 = int(bx1), int(by1), int(bx2), int(by2)
            crop = original_image[iy1:iy2, ix1:ix2]
            polygon = extract_bubble_polygon(crop, (ix1, iy1))
            
            results.append({
                'label': 'bubble',
                'conf': round(conf, 4),
                'box': [ix1, iy1, ix2, iy2],
                'polygon': polygon
            })
        
        results.sort(key=lambda x: x['conf'], reverse=True)
        
        logger.info(f"Detected {len(results)} bubbles")
        return results
    
    def detect(self, image_bytes: bytes) -> List[Dict]:
        """Detect speech bubbles in an image."""
        # Decode image bytes to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            logger.error("Failed to decode image")
            return []
        
        original_shape = image.shape[:2]  # (height, width)
        logger.info(f"Processing image of size {original_shape[1]}x{original_shape[0]}")
        
        # Preprocess
        input_tensor, ratio, dwdh = self.preprocess(image)
        
        # Run inference
        outputs = self._session.run(
            [self._output_name],
            {self._input_name: input_tensor}
        )[0]
        
        # Postprocess
        results = self.postprocess(outputs, ratio, dwdh, original_shape, image)
        
        return results


# Module-level singleton
_detector: Optional[BubbleDetector] = None


def get_detector() -> BubbleDetector:
    """Get the singleton detector instance."""
    global _detector
    if _detector is None:
        _detector = BubbleDetector()
    return _detector


def detect_bubbles(image_bytes: bytes) -> List[Dict]:
    """Convenience function to detect bubbles in an image."""
    detector = get_detector()
    return detector.detect(image_bytes)
