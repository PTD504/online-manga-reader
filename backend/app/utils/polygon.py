"""
Polygon extraction helpers for speech bubble regions.

This module isolates contour-based polygon extraction from detector inference logic.
"""

from typing import List, Tuple

import cv2
import numpy as np


def extract_bubble_polygon(
    crop: np.ndarray,
    box_offset: Tuple[int, int],
    min_contour_area: float = 80.0
) -> List[List[int]]:
    """
    Extract a speech-bubble polygon using Connected Components from the center out.
    """
    if crop.size == 0:
        return []

    offset_x, offset_y = box_offset
    pad = 10

    # Pad with BLACK to ensure the bounding box edges are considered background
    padded_crop = cv2.copyMakeBorder(
        crop, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(0, 0, 0)
    )

    if len(padded_crop.shape) == 3:
        gray = cv2.cvtColor(padded_crop, cv2.COLOR_BGR2GRAY)
    else:
        gray = padded_crop.copy()

    # Adaptive threshold: Paper interior = WHITE, Ink/Dark Backgrounds = BLACK
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 7
    )

    # Find connected white regions
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
        binary, connectivity=8
    )

    h, w = binary.shape
    center_x, center_y = w // 2, h // 2

    best_label = -1
    best_score = -1.0

    # Iterate through all regions, ignoring label 0 (background)
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < min_contour_area:
            continue
            
        cx, cy = centroids[i]
        
        # Calculate Euclidean distance from the center of the crop
        dist = np.sqrt((cx - center_x)**2 + (cy - center_y)**2)
        
        # Scoring metric: large area and close to center
        score = float(area) / (dist + 1.0)
        
        if score > best_score:
            best_score = score
            best_label = i

    if best_label == -1:
        return []

    # Isolate the winning region (the bubble interior)
    bubble_mask = np.uint8(labels == best_label) * 255

    # Dilate gently to capture the inner edge of the black drawn border
    kernel = np.ones((3, 3), dtype=np.uint8)
    bubble_mask = cv2.dilate(bubble_mask, kernel, iterations=1)

    # Find the contour of the isolated interior
    contours, _ = cv2.findContours(
        bubble_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    if not contours:
        return []

    contour = max(contours, key=cv2.contourArea)

    if cv2.contourArea(contour) < min_contour_area:
        return []

    # Approximate polygon
    epsilon = 0.008 * cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, epsilon, True)

    if len(approx) < 3:
        return []

    polygon: List[List[int]] = []
    for point in approx:
        x, y = point[0]
        final_x = int((x - pad) + offset_x)
        final_y = int((y - pad) + offset_y)
        polygon.append([final_x, final_y])

    return polygon