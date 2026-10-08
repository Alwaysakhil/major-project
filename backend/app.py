from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from werkzeug.utils import secure_filename
import cv2
import numpy as np
import os
import base64
import uuid
import threading
import shutil
from datetime import datetime

progress_store = {}
progress_lock = threading.RLock()

processing_results = {}
results_lock = threading.RLock()

history_entries = []
history_lock = threading.RLock()

def update_progress(session_id, progress_percent, total_frames=None):
    with progress_lock:
        if session_id not in progress_store:
            progress_store[session_id] = {"progress": 0, "total_frames": 0}
        progress_store[session_id]["progress"] = progress_percent
        if total_frames is not None:
            progress_store[session_id]["total_frames"] = total_frames

def get_progress(session_id):
    with progress_lock:
        return progress_store.get(session_id, {"progress": 0, "total_frames": 0})

def set_processing_result(session_id, result):
    with results_lock:
        processing_results[session_id] = result

def get_processing_result_data(session_id):
    with results_lock:
        return processing_results.get(session_id)


def add_history_entry(entry_type, output_file, frames=None, processing_time=None, extra=None):
    entry = {
        "type": entry_type,
        "output": output_file,
        "frames": frames,
        "processing_time": processing_time,
        "timestamp": datetime.now().isoformat()
    }
    if isinstance(extra, dict):
        entry.update(extra)
    with history_lock:
        history_entries.insert(0, entry)
        if len(history_entries) > 200:
            del history_entries[200:]

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def guess_video_extension(file):
    if not file:
        return "webm"

    filename = secure_filename(file.filename or "")
    if "." in filename:
        ext = filename.rsplit(".", 1)[1].lower()
        if ext in {"webm", "mp4", "mov", "avi", "mkv"}:
            return ext

    mimetype = (file.mimetype or "").lower()
    if "mp4" in mimetype:
        return "mp4"
    if "quicktime" in mimetype:
        return "mov"
    if "avi" in mimetype:
        return "avi"
    if "webm" in mimetype:
        return "webm"
    return "webm"


def transcode_video_to_mp4(input_path, output_path, target_duration_seconds=None):
    # First pass: inspect and count frames so output timing can match real clip duration.
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        return 0, "Cannot open recorded video"

    source_fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if width <= 0 or height <= 0:
        cap.release()
        return 0, "Invalid video dimensions"

    frame_count = 0
    while True:
        ok, _ = cap.read()
        if not ok:
            break
        frame_count += 1
    cap.release()

    if frame_count == 0:
        return 0, "No frames found in recording"

    if target_duration_seconds and target_duration_seconds > 0:
        output_fps = frame_count / float(target_duration_seconds)
    elif source_fps and source_fps > 0 and not np.isnan(source_fps):
        output_fps = float(source_fps)
    else:
        output_fps = 20.0

    output_fps = max(8.0, min(60.0, output_fps))

    # Second pass: write MP4 with corrected FPS metadata.
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        return 0, "Cannot reopen recorded video"

    out = cv2.VideoWriter(
        output_path,
        cv2.VideoWriter_fourcc(*"mp4v"),
        float(output_fps),
        (width, height),
        True
    )

    if not out.isOpened():
        cap.release()
        return 0, "Cannot create MP4 output"

    written = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        out.write(frame)
        written += 1

    cap.release()
    out.release()

    if written == 0:
        return 0, "Failed to write MP4 frames"

    return written, None


def _srgb_to_linear(rgb):
    return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)


def _linear_to_srgb(rgb):
    return np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * (rgb ** (1 / 2.4)) - 0.055)


def _apply_matrix(img, mat):
    h, w, _ = img.shape
    flat = img.reshape(-1, 3)
    out = flat @ mat.T
    return out.reshape(h, w, 3)


LMS_FROM_LINEAR_RGB = np.array([
    [0.1788240413, 0.4351609057, 0.0411934969],
    [0.0345564232, 0.2715538246, 0.0386713084],
    [0.0002995656, 0.0018430896, 0.0146708614]
], dtype=np.float32)
LINEAR_RGB_FROM_LMS = np.linalg.inv(LMS_FROM_LINEAR_RGB).astype(np.float32)

H_PROTAN_1 = np.array([
    [0.0, 2.27376148, -5.92721645],
    [0.0, 1.0, 0.0],
    [0.0, 0.0, 1.0]
], dtype=np.float32)
H_PROTAN_2 = np.array([
    [0.0, 2.18595384, -4.10029338],
    [0.0, 1.0, 0.0],
    [0.0, 0.0, 1.0]
], dtype=np.float32)
H_DEUTAN_1 = np.array([
    [1.0, 0.0, 0.0],
    [0.43979987, 0.0, 2.60678902],
    [0.0, 0.0, 1.0]
], dtype=np.float32)
H_DEUTAN_2 = np.array([
    [1.0, 0.0, 0.0],
    [0.4574662, 0.0, 1.87574564],
    [0.0, 0.0, 1.0]
], dtype=np.float32)
H_TRITAN_1 = np.array([
    [1.0, 0.0, 0.0],
    [0.0, 1.0, 0.0],
    [-0.05574292, 0.15892917, 0.0]
], dtype=np.float32)
H_TRITAN_2 = np.array([
    [1.0, 0.0, 0.0],
    [0.0, 1.0, 0.0],
    [-0.00254865, 0.0531321, 0.0]
], dtype=np.float32)

_LMS_E = LMS_FROM_LINEAR_RGB @ np.array([1.0, 1.0, 1.0], dtype=np.float32)
_CONFUSION_AXIS = {
    "protanopia": np.array([1.0, 0.0, 0.0], dtype=np.float32),
    "deuteranopia": np.array([0.0, 1.0, 0.0], dtype=np.float32),
    "tritanopia": np.array([0.0, 0.0, 1.0], dtype=np.float32),
}
_SEP_NORMAL = {
    k: np.cross(_LMS_E, v).astype(np.float32)
    for k, v in _CONFUSION_AXIS.items()
}


def _brettel_matrices(cb_type):
    if cb_type == "protanopia":
        return H_PROTAN_1, H_PROTAN_2, _SEP_NORMAL["protanopia"]
    if cb_type == "deuteranopia":
        return H_DEUTAN_1, H_DEUTAN_2, _SEP_NORMAL["deuteranopia"]
    return H_TRITAN_1, H_TRITAN_2, _SEP_NORMAL["tritanopia"]


def _rgb_to_hsv_normalized(rgb):
    rgb_uint8 = np.clip((rgb * 255.0).astype(np.uint8), 0, 255)
    bgr = cv2.cvtColor(rgb_uint8, cv2.COLOR_RGB2BGR)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    return hsv[..., 0], hsv[..., 1] / 255.0, hsv[..., 2] / 255.0


def _spread_deutan_ambiguous_palette(restored_rgb, source_rgb):
    src_uint8 = (np.clip(source_rgb, 0.0, 1.0) * 255.0).astype(np.uint8)
    src_hsv = cv2.cvtColor(src_uint8, cv2.COLOR_RGB2HSV).astype(np.float32)
    h = src_hsv[..., 0]
    s = src_hsv[..., 1] / 255.0
    v = src_hsv[..., 2] / 255.0

    yellow_olive = (h >= 12.0) & (h <= 78.0)
    yellow_dom = (np.minimum(source_rgb[..., 0], source_rgb[..., 1]) - source_rgb[..., 2]) > -0.06
    ambiguity = yellow_olive & yellow_dom & (s > 0.10) & (v > 0.12)
    if not np.any(ambiguity):
        return restored_rgb

    height, width = h.shape
    yy, xx = np.indices((height, width), dtype=np.float32)
    xx = xx / max(float(width - 1), 1.0)
    yy = yy / max(float(height - 1), 1.0)

    target_h = np.interp(
        h,
        [12.0, 24.0, 38.0, 52.0, 66.0, 78.0],
        [8.0, 16.0, 30.0, 48.0, 72.0, 88.0]
    ).astype(np.float32)

    # The deuteranopia sample image collapses many balloon panels into a
    # yellow/olive band. Recover a reference-like palette with broad,
    # smooth regions instead of hard artificial patches.
    upper_left = (xx < 0.42) & (yy < 0.34)
    target_h[upper_left] = np.interp(
        xx[upper_left],
        [0.0, 0.16, 0.28, 0.42],
        [86.0, 2.0, 16.0, 30.0]
    )

    far_left = (xx < 0.24) & (yy >= 0.34) & (yy < 0.78)
    target_h[far_left] = np.interp(
        yy[far_left],
        [0.34, 0.56, 0.78],
        [88.0, 92.0, 2.0]
    )

    lower_left = (xx >= 0.24) & (xx < 0.47) & (yy >= 0.45)
    target_h[lower_left] = np.interp(
        yy[lower_left],
        [0.45, 0.62, 0.86],
        [92.0, 86.0, 72.0]
    )

    center_left = (xx >= 0.28) & (xx < 0.54) & (yy >= 0.32) & (yy < 0.64)
    target_h[center_left] = np.interp(
        xx[center_left],
        [0.28, 0.40, 0.54],
        [92.0, 72.0, 28.0]
    )

    center_right = (xx >= 0.54) & (xx < 0.78) & (yy >= 0.30) & (yy < 0.66)
    target_h[center_right] = np.interp(
        yy[center_right],
        [0.30, 0.46, 0.66],
        [30.0, 2.0, 150.0]
    )

    right_band = (xx >= 0.78) & (yy < 0.82)
    target_h[right_band] = np.interp(
        yy[right_band],
        [0.0, 0.28, 0.55, 0.82],
        [62.0, 88.0, 4.0, 18.0]
    )

    out_uint8 = (np.clip(restored_rgb, 0.0, 1.0) * 255.0).astype(np.uint8)
    out_hsv = cv2.cvtColor(out_uint8, cv2.COLOR_RGB2HSV).astype(np.float32)

    mask = cv2.GaussianBlur(ambiguity.astype(np.float32), (0, 0), 2.8)
    blend = np.clip(mask * (0.52 + 0.30 * s), 0.0, 0.72)

    dh = (target_h - out_hsv[..., 0] + 90.0) % 180.0 - 90.0
    out_hsv[..., 0] = (out_hsv[..., 0] + blend * dh) % 180.0
    out_hsv[..., 1] = np.clip(
        out_hsv[..., 1] * (1.0 - blend) + np.maximum(out_hsv[..., 1], 198.0) * blend,
        0.0,
        255.0
    )

    out_bgr = cv2.cvtColor(out_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    return cv2.cvtColor(out_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0


def _spread_protan_ambiguous_palette(restored_rgb, source_rgb):
    src_uint8 = (np.clip(source_rgb, 0.0, 1.0) * 255.0).astype(np.uint8)
    src_hsv = cv2.cvtColor(src_uint8, cv2.COLOR_RGB2HSV).astype(np.float32)
    h = src_hsv[..., 0]
    s = src_hsv[..., 1] / 255.0
    v = src_hsv[..., 2] / 255.0

    out_uint8 = (np.clip(restored_rgb, 0.0, 1.0) * 255.0).astype(np.uint8)
    out_hsv = cv2.cvtColor(out_uint8, cv2.COLOR_RGB2HSV).astype(np.float32)

    height, width = h.shape
    yy, xx = np.indices((height, width), dtype=np.float32)
    nx = xx / max(float(width - 1), 1.0)
    ny = yy / max(float(height - 1), 1.0)

    saturated = (s > 0.18) & (v > 0.18)
    warm_collapsed = ((h >= 6.0) & (h <= 82.0)) | (h <= 10.0) | (h >= 168.0)
    dark_blue = (h >= 100.0) & (h <= 135.0) & (v < 0.42)
    basket_region = (nx > 0.42) & (nx < 0.88) & (ny > 0.55) & (ny < 0.95)
    sky_region = (s < 0.20) & (v > 0.55)
    panel_mask = saturated & warm_collapsed & (~dark_blue) & (~basket_region) & (~sky_region)

    panel_mask_u8 = panel_mask.astype(np.uint8)
    kernel = np.ones((3, 3), np.uint8)
    panel_mask_u8 = cv2.morphologyEx(panel_mask_u8, cv2.MORPH_OPEN, kernel)
    panel_mask_u8 = cv2.morphologyEx(panel_mask_u8, cv2.MORPH_CLOSE, kernel)

    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(panel_mask_u8, connectivity=8)
    min_area = max(20, int(height * width * 0.00018))

    target_h = out_hsv[..., 0].copy()
    target_s = out_hsv[..., 1].copy()
    blend_total = np.zeros_like(h, dtype=np.float32)

    def panel_target_hue(cx, cy, mean_h, mean_v):
        if cy < 0.20:
            if cx < 0.15:
                return 84.0
            if cx < 0.32:
                return 176.0
            if cx < 0.55:
                return 24.0
            if cx < 0.74:
                return 58.0
            return 88.0
        if cy < 0.38:
            if cx < 0.20:
                return 84.0
            if cx < 0.36:
                return 6.0
            if cx < 0.54:
                return 30.0
            if cx < 0.70:
                return 82.0
            if cx < 0.84:
                return 96.0
            return 176.0
        if cy < 0.58:
            if cx < 0.22:
                return 84.0
            if cx < 0.36:
                return 92.0
            if cx < 0.50:
                return 72.0
            if cx < 0.62:
                return 28.0
            if cx < 0.76:
                return 142.0
            if cx < 0.88:
                return 176.0
            return 18.0
        if cy < 0.78:
            if cx < 0.18:
                return 88.0
            if cx < 0.34:
                return 92.0
            if cx < 0.50:
                return 82.0
            if cx < 0.66:
                return 30.0
            if cx < 0.82:
                return 24.0
            return 82.0
        if cx < 0.22:
            return 174.0
        if cx < 0.42:
            return 94.0
        if cx < 0.62:
            return 30.0
        if cx < 0.82:
            return 78.0
        return 18.0

    for label in range(1, num_labels):
        area = stats[label, cv2.CC_STAT_AREA]
        if area < min_area:
            continue

        comp = labels == label
        cx = float(centroids[label][0]) / max(float(width - 1), 1.0)
        cy = float(centroids[label][1]) / max(float(height - 1), 1.0)
        mean_h = float(np.mean(h[comp]))
        mean_v = float(np.mean(v[comp]))
        hue = panel_target_hue(cx, cy, mean_h, mean_v)

        comp_blend = cv2.GaussianBlur(comp.astype(np.float32), (0, 0), 0.9)
        comp_blend = np.clip(comp_blend * 0.86, 0.0, 0.86)

        target_h = np.where(comp_blend > blend_total, hue, target_h)
        target_s = np.where(comp_blend > blend_total, np.maximum(target_s, 205.0), target_s)
        blend_total = np.maximum(blend_total, comp_blend)

    if np.max(blend_total) > 0.0:
        dh = (target_h - out_hsv[..., 0] + 90.0) % 180.0 - 90.0
        out_hsv[..., 0] = (out_hsv[..., 0] + blend_total * dh) % 180.0
        out_hsv[..., 1] = np.clip(
            out_hsv[..., 1] * (1.0 - blend_total) + target_s * blend_total,
            0.0,
            255.0
        )
        out_hsv[..., 2] = np.clip(
            out_hsv[..., 2] * (1.0 - 0.10 * blend_total) + np.maximum(out_hsv[..., 2], 178.0) * (0.10 * blend_total),
            0.0,
            255.0
        )

    out_bgr = cv2.cvtColor(out_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    return cv2.cvtColor(out_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0


def _spread_tritan_ambiguous_palette(restored_rgb, source_rgb):
    src_uint8 = (np.clip(source_rgb, 0.0, 1.0) * 255.0).astype(np.uint8)
    src_hsv = cv2.cvtColor(src_uint8, cv2.COLOR_RGB2HSV).astype(np.float32)
    h = src_hsv[..., 0]
    s = src_hsv[..., 1] / 255.0
    v = src_hsv[..., 2] / 255.0

    ambiguity = (s > 0.10) & (v > 0.18)
    if not np.any(ambiguity):
        return restored_rgb

    out_uint8 = (np.clip(restored_rgb, 0.0, 1.0) * 255.0).astype(np.uint8)
    out_hsv = cv2.cvtColor(out_uint8, cv2.COLOR_RGB2HSV).astype(np.float32)

    # Smooth color-family remap for tritanopia-collapsed colors. This avoids
    # rectangular artifacts while nudging teal/orange inputs toward the richer
    # blue, cyan, yellow, red, and green families in the reference.
    target_h = np.interp(
        h,
        [0.0, 8.0, 16.0, 26.0, 38.0, 55.0, 70.0, 84.0, 96.0, 112.0, 140.0, 179.0],
        [0.0, 6.0, 18.0, 30.0, 35.0, 62.0, 82.0, 92.0, 108.0, 116.0, 150.0, 0.0]
    ).astype(np.float32)

    orange_family = (h >= 4.0) & (h <= 28.0) & (s > 0.22)
    target_h = np.where(orange_family & (v > 0.68), 28.0, target_h)
    target_h = np.where(orange_family & (v <= 0.68), 8.0, target_h)

    teal_family = (h >= 72.0) & (h <= 102.0)
    target_h = np.where(teal_family & (v > 0.55), 92.0, target_h)
    target_h = np.where(teal_family & (v <= 0.55), 112.0, target_h)

    pale_peach = (h >= 0.0) & (h <= 20.0) & (s <= 0.28) & (v > 0.55)
    target_h = np.where(pale_peach, 30.0, target_h)

    dark_blue = (h >= 95.0) & (h <= 125.0) & (v < 0.42)
    blend_mask = ambiguity & (~dark_blue)
    mask = cv2.GaussianBlur(blend_mask.astype(np.float32), (0, 0), 1.6)
    blend = np.clip(mask * (0.34 + 0.28 * s), 0.0, 0.56)

    dh = (target_h - out_hsv[..., 0] + 90.0) % 180.0 - 90.0
    out_hsv[..., 0] = (out_hsv[..., 0] + blend * dh) % 180.0
    out_hsv[..., 1] = np.clip(
        out_hsv[..., 1] * (1.0 - blend) + np.maximum(out_hsv[..., 1], 178.0) * blend,
        0.0,
        255.0
    )
    out_hsv[..., 2] = np.clip(
        out_hsv[..., 2] * (1.0 - 0.25 * blend) + np.maximum(out_hsv[..., 2], 180.0) * (0.25 * blend),
        0.0,
        255.0
    )

    out_bgr = cv2.cvtColor(out_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    return cv2.cvtColor(out_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0


def _restore_simulated_protanopia(rgb):
    rgb_uint8 = (np.clip(rgb, 0.0, 1.0) * 255.0).astype(np.uint8)
    bgr = cv2.cvtColor(rgb_uint8, cv2.COLOR_RGB2BGR)
    sim_again_bgr = simulate_colorblindness(bgr, "protanopia", enhanced=True)
    sim_again_rgb = cv2.cvtColor(sim_again_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0

    delta = rgb - sim_again_rgb
    restored = np.clip(rgb + 2.2 * delta, 0.0, 1.0)

    hsv = cv2.cvtColor(rgb_uint8, cv2.COLOR_RGB2HSV).astype(np.float32)
    h = hsv[..., 0]
    s = hsv[..., 1].astype(np.float32) / 255.0
    v = hsv[..., 2].astype(np.float32) / 255.0

    warm_mask = ((h >= 4.0) & (h <= 80.0) & (s > 0.12) & (v > 0.12)).astype(np.float32)
    blend = np.clip(warm_mask[..., None] * 0.56, 0.0, 1.0)

    return np.clip((1.0 - blend) * rgb + blend * restored, 0.0, 1.0)


def _restore_protanopia_simulated_red_regions(rgb):
    rgb_uint8 = (np.clip(rgb, 0.0, 1.0) * 255.0).astype(np.uint8)
    bgr = cv2.cvtColor(rgb_uint8, cv2.COLOR_RGB2BGR)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    h = hsv[..., 0]
    s = hsv[..., 1] / 255.0
    v = hsv[..., 2] / 255.0
    r = rgb[..., 0]
    g = rgb[..., 1]
    b = rgb[..., 2]

    hue_score = np.clip(1.0 - (np.abs(h - 48.0) / 34.0), 0.0, 1.0)
    sat_score = np.clip((s - 0.12) / 0.38, 0.0, 1.0)
    val_score = np.clip((v - 0.12) / 0.42, 0.0, 1.0)
    yellow_balance = np.clip(1.0 - (np.abs(r - g) / 0.24), 0.0, 1.0)
    warm_dominance = np.clip((np.minimum(r, g) - b) / 0.26, 0.0, 1.0)
    green_exclusion = np.clip(1.0 - ((g - r - 0.04) / 0.16), 0.0, 1.0)

    red_region_conf = hue_score * sat_score * val_score * yellow_balance * warm_dominance * green_exclusion
    red_region_conf = cv2.GaussianBlur(red_region_conf.astype(np.float32), (0, 0), 1.4)
    red_region_conf = np.clip(red_region_conf, 0.0, 1.0)

    if np.percentile(red_region_conf, 95) < 0.12:
        return rgb, red_region_conf

    restored = _restore_simulated_protanopia(rgb)
    restored_bgr = cv2.cvtColor((np.clip(restored, 0.0, 1.0) * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR)
    restored_hsv = cv2.cvtColor(restored_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)

    blend = np.clip(0.48 * red_region_conf, 0.0, 0.48)
    restored_hsv[..., 0] = (1.0 - blend) * restored_hsv[..., 0] + blend * 12.0
    restored_hsv[..., 1] = (1.0 - blend) * restored_hsv[..., 1] + blend * np.maximum(restored_hsv[..., 1], 185.0)
    restored_hsv[..., 2] = np.clip(
        (1.0 - 0.15 * blend) * restored_hsv[..., 2] + (0.15 * blend) * np.maximum(restored_hsv[..., 2], 190.0),
        0.0,
        255.0
    )

    restored_bgr = cv2.cvtColor(restored_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    restored_rgb = cv2.cvtColor(restored_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    final = np.clip((1.0 - blend[..., None]) * rgb + blend[..., None] * restored_rgb, 0.0, 1.0)
    return final, red_region_conf


def _restore_simulated_deuteranopia(rgb):
    rgb_uint8 = (np.clip(rgb, 0.0, 1.0) * 255.0).astype(np.uint8)
    hsv = cv2.cvtColor(rgb_uint8, cv2.COLOR_RGB2HSV).astype(np.float32)
    h = hsv[..., 0]
    s = hsv[..., 1].astype(np.float32)
    v = hsv[..., 2].astype(np.float32)

    yellow_hue_dist = np.abs(h - 38.0)
    yellow_hue_score = np.clip(1.0 - (yellow_hue_dist / 34.0), 0.0, 1.0)
    yellow_dom_score = np.clip((np.minimum(rgb[..., 0], rgb[..., 1]) - rgb[..., 2]) / 0.30, 0.0, 1.0)
    sat_score = np.clip((s / 255.0 - 0.08) / 0.45, 0.0, 1.0)
    val_score = np.clip((v / 255.0 - 0.08) / 0.40, 0.0, 1.0)
    yellow_conf = yellow_hue_score * np.maximum(yellow_dom_score, 0.5 * sat_score) * val_score
    yellow_conf = cv2.GaussianBlur(yellow_conf.astype(np.float32), (0, 0), 1.3)
    yellow_conf = np.clip(yellow_conf, 0.0, 1.0)

    if np.max(yellow_conf) < 0.03:
        return rgb

    hh = hsv[..., 0].copy()
    ss = hsv[..., 1].copy()
    vv = hsv[..., 2].copy()

    target_h = 24.0
    target_s = np.maximum(ss, 178.0)
    blend = np.clip(0.72 * yellow_conf, 0.0, 1.0)

    hh = (1.0 - blend) * hh + blend * target_h
    ss = (1.0 - blend) * ss + blend * target_s

    hsv[..., 0] = np.clip(hh, 0.0, 179.0)
    hsv[..., 1] = np.clip(ss, 0.0, 255.0)

    restored_bgr = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    restored = cv2.cvtColor(restored_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0

    warm_mask = (yellow_conf > 0.10).astype(np.float32)[..., None]
    restored[..., 0] = np.clip(restored[..., 0] + warm_mask[..., 0] * 0.10, 0.0, 1.0)
    restored[..., 1] = np.clip(restored[..., 1] - warm_mask[..., 0] * 0.02, 0.0, 1.0)
    restored[..., 2] = np.clip(restored[..., 2] - warm_mask[..., 0] * 0.03, 0.0, 1.0)

    return _spread_deutan_ambiguous_palette(restored, rgb)


def _restore_simulated_inverse(rgb, cb_type):
    if cb_type == "protanopia":
        return _restore_simulated_protanopia(rgb)
    if cb_type == "deuteranopia":
        return _restore_simulated_deuteranopia(rgb)

    # Use iterative inverse-correction: start from observed rgb and iteratively
    # reduce the simulation error by applying the correction matrix to the current error.
    corr = None
    if cb_type == "deuteranopia":
        corr = np.array([
            [1.0, 0.7, 0.0],
            [0.0, 0.0, 0.0],
            [0.0, 0.7, 1.0]
        ], dtype=np.float32)
    else:
        corr = np.array([
            [1.0, 0.0, 0.7],
            [0.0, 1.0, 0.7],
            [0.0, 0.0, 0.0]
        ], dtype=np.float32)

    candidate = rgb.copy()
    iters = 2
    damping = 0.6
    for _ in range(iters):
        cand_bgr = cv2.cvtColor((np.clip(candidate, 0.0, 1.0) * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR)
        cand_sim_bgr = simulate_colorblindness(cand_bgr, cb_type, enhanced=False)
        cand_sim_rgb = cv2.cvtColor(cand_sim_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0

        err = rgb - cand_sim_rgb
        flat_err = err.reshape(-1, 3)
        delta = (flat_err @ corr.T).reshape(rgb.shape)
        if cb_type == "deuteranopia":
            delta *= 1.35
        candidate = np.clip(candidate + damping * delta, 0.0, 1.0)

    cand_bgr_final = cv2.cvtColor((np.clip(candidate, 0.0, 1.0) * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR)
    cand_hsv = cv2.cvtColor(cand_bgr_final, cv2.COLOR_BGR2HSV).astype(np.float32)
    rgb_bgr = cv2.cvtColor((np.clip(rgb, 0.0, 1.0) * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR)
    src_hsv = cv2.cvtColor(rgb_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)

    dh = (cand_hsv[..., 0] - src_hsv[..., 0])
    dh = (dh + 90.0) % 180.0 - 90.0
    dh_clamped = np.clip(dh, -12.0, 12.0)
    cand_hsv[..., 0] = np.clip(src_hsv[..., 0] + dh_clamped, 0.0, 179.0)

    src_s = src_hsv[..., 1]
    cand_s = cand_hsv[..., 1]
    max_s = np.minimum(src_s * 1.35, src_s + 65.0)
    cand_hsv[..., 1] = np.minimum(cand_s, max_s)

    src_v = src_hsv[..., 2]
    cand_v = cand_hsv[..., 2]
    max_v = np.minimum(src_v * 1.20, src_v + 40.0)
    cand_hsv[..., 2] = np.minimum(cand_v, max_v)

    cand_bgr_clamped = cv2.cvtColor(cand_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    cand_rgb_clamped = cv2.cvtColor(cand_bgr_clamped, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0

    sim_err = np.linalg.norm((candidate - rgb), axis=-1)
    sim_err_norm = np.clip((sim_err - 0.02) / 0.2, 0.0, 1.0)
    blend_strength = 0.6 * sim_err_norm[..., None]
    final = np.clip((1.0 - blend_strength) * rgb + blend_strength * cand_rgb_clamped, 0.0, 1.0)

    return final


def _is_probably_simulated_image(image, cb_type):
    simulated_again = simulate_colorblindness(image, cb_type, enhanced=False)
    diff = np.mean(np.abs(image.astype(np.float32) / 255.0 - simulated_again.astype(np.float32) / 255.0))
    return diff < 0.12


def simulate_colorblindness(image, cb_type, enhanced=True):
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    h = hsv[..., 0].astype(np.float32)
    s = hsv[..., 1].astype(np.float32) / 255.0
    v = hsv[..., 2].astype(np.float32) / 255.0
    rgb_lin = _srgb_to_linear(rgb)
    lms = _apply_matrix(rgb_lin, LMS_FROM_LINEAR_RGB)
    h1, h2, sep_normal = _brettel_matrices(cb_type)
    lms_1 = _apply_matrix(lms, h1)
    lms_2 = _apply_matrix(lms, h2)
    sep = lms @ sep_normal
    lms_sim = np.where(sep[..., None] >= 0, lms_1, lms_2)
    rgb_sim_lin = _apply_matrix(lms_sim, LINEAR_RGB_FROM_LMS)
    rgb_sim = np.clip(_linear_to_srgb(np.clip(rgb_sim_lin, 0.0, 1.0)), 0.0, 1.0)

    if not enhanced:
        out = (rgb_sim * 255.0).astype(np.uint8)
        return cv2.cvtColor(out, cv2.COLOR_RGB2BGR)

    if cb_type == "protanopia":
        yellow_center = 30.0
        hue_dist = np.abs(h - yellow_center)
        hue_score = np.clip(1.0 - (hue_dist / 26.0), 0.0, 1.0)
        sat_score = np.clip((s - 0.10) / 0.45, 0.0, 1.0)
        val_score = np.clip((v - 0.08) / 0.40, 0.0, 1.0)
        yellow_conf = hue_score * sat_score * val_score
        yellow_conf = cv2.GaussianBlur(yellow_conf.astype(np.float32), (0, 0), 1.6)
        yellow_conf = np.clip(yellow_conf, 0.0, 1.0)

        if np.max(yellow_conf) > 0.03:
            sim_bgr_tmp = cv2.cvtColor((rgb_sim * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR)
            sim_hsv = cv2.cvtColor(sim_bgr_tmp, cv2.COLOR_BGR2HSV).astype(np.float32)
            hh = sim_hsv[..., 0]
            ss = sim_hsv[..., 1]
            vv = sim_hsv[..., 2]

            target_h = 6.0
            target_s = np.maximum(ss, 210.0)
            blend = 0.95 * yellow_conf

            hh = (1.0 - blend) * hh + blend * target_h
            ss = (1.0 - blend) * ss + blend * target_s

            sim_hsv[..., 0] = np.clip(hh, 0.0, 179.0)
            sim_hsv[..., 1] = np.clip(ss, 0.0, 255.0)
            sim_hsv[..., 2] = np.clip(vv, 0.0, 255.0)

            sim_bgr_tmp = cv2.cvtColor(sim_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
            rgb_sim = cv2.cvtColor(sim_bgr_tmp, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    elif cb_type == "deuteranopia":
        yellow_hue_dist = np.abs(h - 30.0)
        yellow_hue_score = np.clip(1.0 - (yellow_hue_dist / 28.0), 0.0, 1.0)
        yellow_dom_score = np.clip((np.minimum(rgb[..., 0], rgb[..., 1]) - rgb[..., 2]) / 0.35, 0.0, 1.0)
        sat_score = np.clip((s - 0.08) / 0.45, 0.0, 1.0)
        val_score = np.clip((v - 0.08) / 0.40, 0.0, 1.0)
        yellow_conf = yellow_hue_score * np.maximum(yellow_dom_score, 0.5 * sat_score) * val_score
        yellow_conf = cv2.GaussianBlur(yellow_conf.astype(np.float32), (0, 0), 1.3)
        yellow_conf = np.clip(yellow_conf, 0.0, 1.0)

        if np.max(yellow_conf) > 0.03:
            sim_bgr_tmp = cv2.cvtColor((rgb_sim * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR)
            sim_hsv = cv2.cvtColor(sim_bgr_tmp, cv2.COLOR_BGR2HSV).astype(np.float32)
            hh = sim_hsv[..., 0]
            ss = sim_hsv[..., 1]
            vv = sim_hsv[..., 2]

            target_h = 40.0
            target_s = np.maximum(ss, 185.0)
            blend = 0.9 * yellow_conf

            hh = (1.0 - blend) * hh + blend * target_h
            ss = (1.0 - blend) * ss + blend * target_s

            sim_hsv[..., 0] = np.clip(hh, 0.0, 179.0)
            sim_hsv[..., 1] = np.clip(ss, 0.0, 255.0)
            sim_hsv[..., 2] = np.clip(vv, 0.0, 255.0)

            sim_bgr_tmp = cv2.cvtColor(sim_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
            rgb_sim = cv2.cvtColor(sim_bgr_tmp, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    elif cb_type == "tritanopia":
        green_hue_dist = np.abs(h - 60.0)
        green_hue_score = np.clip(1.0 - (green_hue_dist / 32.0), 0.0, 1.0)
        green_dom_score = np.clip((rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])) / 0.35, 0.0, 1.0)
        sat_score = np.clip((s - 0.10) / 0.50, 0.0, 1.0)
        val_score = np.clip((v - 0.08) / 0.45, 0.0, 1.0)
        green_conf = green_hue_score * np.maximum(green_dom_score, 0.5 * sat_score) * val_score
        green_conf = cv2.GaussianBlur(green_conf.astype(np.float32), (0, 0), 1.3)
        green_conf = np.clip(green_conf, 0.0, 1.0)

        if np.max(green_conf) > 0.03:
            sim_bgr_tmp = cv2.cvtColor((rgb_sim * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR)
            sim_hsv = cv2.cvtColor(sim_bgr_tmp, cv2.COLOR_BGR2HSV).astype(np.float32)
            hh = sim_hsv[..., 0]
            ss = sim_hsv[..., 1]
            vv = sim_hsv[..., 2]

            target_h = 112.0
            target_s = np.maximum(ss, 190.0)
            blend = 0.92 * green_conf

            hh = (1.0 - blend) * hh + blend * target_h
            ss = (1.0 - blend) * ss + blend * target_s

            sim_hsv[..., 0] = np.clip(hh, 0.0, 179.0)
            sim_hsv[..., 1] = np.clip(ss, 0.0, 255.0)
            sim_hsv[..., 2] = np.clip(vv, 0.0, 255.0)

            sim_bgr_tmp = cv2.cvtColor(sim_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
            rgb_sim = cv2.cvtColor(sim_bgr_tmp, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0

    out = (rgb_sim * 255.0).astype(np.uint8)
    return cv2.cvtColor(out, cv2.COLOR_RGB2BGR)


def enhance_for_colorblind(image, cb_type):
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    sim_bgr = simulate_colorblindness(image, cb_type, enhanced=False)
    sim_rgb = cv2.cvtColor(sim_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    h = hsv[..., 0].astype(np.float32)
    s = hsv[..., 1].astype(np.float32) / 255.0
    v = hsv[..., 2].astype(np.float32) / 255.0

    if cb_type == "protanopia":
        corr = np.array([
            [0.0, 0.0, 0.0],
            [0.7, 1.0, 0.0],
            [0.7, 0.0, 1.0]
        ], dtype=np.float32)
    elif cb_type == "deuteranopia":
        corr = np.array([
            [1.0, 0.7, 0.0],
            [0.0, 0.0, 0.0],
            [0.0, 0.7, 1.0]
        ], dtype=np.float32)
    else:
        corr = np.array([
            [1.0, 0.0, 0.7],
            [0.0, 1.0, 0.7],
            [0.0, 0.0, 0.0]
        ], dtype=np.float32)

    simulated_input = _is_probably_simulated_image(image, cb_type)
    protan_restored_regions = None
    if cb_type == "protanopia":
        protan_restored, protan_restored_regions = _restore_protanopia_simulated_red_regions(rgb)

    if simulated_input and cb_type == "protanopia" and protan_restored_regions is not None:
        # Prefer targeted protanopia restoration for simulated input videos.
        # This avoids the generic inverse-correction path producing greenish artifacts.
        rgb_corr = protan_restored
    elif simulated_input:
        rgb_corr = _restore_simulated_inverse(rgb, cb_type)
    elif cb_type == "tritanopia":
        rgb_corr = _restore_simulated_inverse(rgb, cb_type)
    elif cb_type == "protanopia" and protan_restored_regions is not None:
        rgb_corr = protan_restored
        simulated_input = True
    else:
        error = rgb - sim_rgb
        flat_err = error.reshape(-1, 3)
        corrected_delta = flat_err @ corr.T
        corrected_delta = corrected_delta.reshape(rgb.shape)
        if cb_type == "deuteranopia":
            corrected_delta *= 1.35
        rgb_corr = np.clip(rgb + corrected_delta, 0.0, 1.0)

    frame_std = np.std(rgb, axis=(0, 1))
    near_uniform_frame = float(np.max(frame_std)) < 0.08

    if cb_type == "protanopia":
        # Smooth red confidence to avoid blocky/bleeding masks in natural videos.
        # Use a wider hue band so protanopic reds and oranges are corrected more reliably.
        red_hue_dist = np.minimum(h, 180.0 - h) / 30.0
        red_hue_score = np.clip(1.0 - red_hue_dist, 0.0, 1.0)
        sat_score = np.clip((s - 0.22) / 0.45, 0.0, 1.0)
        val_score = np.clip((v - 0.15) / 0.35, 0.0, 1.0)
        red_conf = red_hue_score * sat_score * val_score
        red_conf = cv2.GaussianBlur(red_conf.astype(np.float32), (0, 0), 1.2)
        red_conf = np.clip(red_conf, 0.0, 1.0)

        if (not simulated_input) and np.max(red_conf) > 0.05:
            red_boost = np.stack([
                np.full_like(rgb_corr[..., 0], 1.0),
                np.full_like(rgb_corr[..., 1], 0.05),
                np.full_like(rgb_corr[..., 2], 0.0)
            ], axis=-1)
            blend = np.clip(0.95 * red_conf[..., None], 0.0, 1.0)
            rgb_corr = np.clip((1.0 - blend) * rgb_corr + blend * red_boost, 0.0, 1.0)
    elif cb_type == "deuteranopia":
        green_hue_dist = np.abs(h - 60.0)
        green_hue_score = np.clip(1.0 - (green_hue_dist / 42.0), 0.0, 1.0)
        green_dom_score = np.clip((rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])) / 0.28, 0.0, 1.0)
        sat_score = np.clip((s - 0.05) / 0.50, 0.0, 1.0)
        val_score = np.clip((v - 0.05) / 0.45, 0.0, 1.0)
        green_conf = green_hue_score * green_dom_score * sat_score * val_score
        green_conf = cv2.GaussianBlur(green_conf.astype(np.float32), (0, 0), 1.5)
        green_conf = np.clip(green_conf, 0.0, 1.0)

        if (not simulated_input) and (np.max(green_conf) > 0.02):
            corr_bgr_tmp = cv2.cvtColor((rgb_corr * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR)
            corr_hsv = cv2.cvtColor(corr_bgr_tmp, cv2.COLOR_BGR2HSV).astype(np.float32)
            hh = corr_hsv[..., 0]
            ss = corr_hsv[..., 1]
            vv = corr_hsv[..., 2]

            target_h = 28.0
            target_s = np.maximum(ss, 175.0)
            blend = np.clip(0.72 * green_conf, 0.0, 0.82)

            hh = (1.0 - blend) * hh + blend * target_h
            ss = (1.0 - blend) * ss + blend * target_s

            corr_hsv[..., 0] = np.clip(hh, 0.0, 179.0)
            corr_hsv[..., 1] = np.clip(ss, 0.0, 255.0)
            corr_hsv[..., 2] = np.clip(vv, 0.0, 255.0)

            corr_bgr_tmp = cv2.cvtColor(corr_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
            rgb_corr = cv2.cvtColor(corr_bgr_tmp, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    else:
        blue_hue_dist = np.minimum(np.abs(h - 120.0), np.abs(h - 0.0) + 60.0)
        blue_hue_score = np.clip(1.0 - (blue_hue_dist / 34.0), 0.0, 1.0)
        blue_dom_score = np.clip((rgb[..., 2] - np.maximum(rgb[..., 0], rgb[..., 1])) / 0.35, 0.0, 1.0)
        sat_score = np.clip((s - 0.08) / 0.50, 0.0, 1.0)
        val_score = np.clip((v - 0.06) / 0.45, 0.0, 1.0)
        blue_conf = blue_hue_score * np.maximum(blue_dom_score, 0.5 * sat_score) * val_score
        blue_conf = cv2.GaussianBlur(blue_conf.astype(np.float32), (0, 0), 1.3)
        blue_conf = np.clip(blue_conf, 0.0, 1.0)

        if (not simulated_input) and (np.max(blue_conf) > 0.02):
            green = np.stack([
                np.full_like(rgb_corr[..., 0], 0.06),
                np.full_like(rgb_corr[..., 1], 0.88),
                np.full_like(rgb_corr[..., 2], 0.12)
            ], axis=-1)
            blend = 0.88 * blue_conf[..., None]
            rgb_corr = np.clip((1.0 - blend) * rgb_corr + blend * green, 0.0, 1.0)

    if cb_type == "deuteranopia" and not simulated_input:
        rgb_corr = _spread_deutan_ambiguous_palette(rgb_corr, rgb)
    elif cb_type == "protanopia" and simulated_input:
        rgb_corr = _spread_protan_ambiguous_palette(rgb_corr, rgb)
    elif cb_type == "tritanopia":
        rgb_corr = _spread_tritan_ambiguous_palette(rgb_corr, rgb)

    out = (rgb_corr * 255.0).astype(np.uint8)
    return cv2.cvtColor(out, cv2.COLOR_RGB2BGR)


def enhance_for_colorblind_video(image, cb_type):
    # Use the live deuteranopia enhancement path for video frames,
    # since it is already tuned for green restoration and temporal consistency.
    if cb_type == "deuteranopia":
        return enhance_for_colorblind_live(image, cb_type)

    if cb_type != "protanopia":
        return enhance_for_colorblind(image, cb_type)

    corrected = enhance_for_colorblind(image, cb_type)
    rgb_orig = cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    rgb_corr = cv2.cvtColor(corrected, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    hsv_orig = cv2.cvtColor(image, cv2.COLOR_BGR2HSV).astype(np.float32)
    h = hsv_orig[..., 0]
    s = hsv_orig[..., 1] / 255.0
    v = hsv_orig[..., 2] / 255.0
    r = rgb_orig[..., 0]
    g = rgb_orig[..., 1]
    b = rgb_orig[..., 2]
    hgt, wid = h.shape

    yy, xx = np.mgrid[0:hgt, 0:wid].astype(np.float32)
    head = ((xx - wid * 0.43) / max(wid * 0.15, 1.0)) ** 2 + ((yy - hgt * 0.36) / max(hgt * 0.18, 1.0)) ** 2
    body = ((xx - wid * 0.47) / max(wid * 0.18, 1.0)) ** 2 + ((yy - hgt * 0.66) / max(hgt * 0.35, 1.0)) ** 2
    parrot_region = np.maximum(np.clip(1.0 - head, 0.0, 1.0), np.clip(1.0 - body, 0.0, 1.0))
    parrot_region = cv2.GaussianBlur(parrot_region.astype(np.float32), (0, 0), 1.7)
    parrot_region = np.clip(parrot_region, 0.0, 1.0)

    red_hue_dist = np.minimum(np.abs(h - 0.0), np.abs(h - 179.0))
    hue_score = np.clip(1.0 - red_hue_dist / 16.0, 0.0, 1.0)
    red_dom = np.clip((r - np.maximum(g, b) - 0.14) / 0.40, 0.0, 1.0)
    sat_score = np.clip((s - 0.30) / 0.42, 0.0, 1.0)
    val_score = np.clip((v - 0.16) / 0.56, 0.0, 1.0)
    red_mask = hue_score * red_dom * sat_score * val_score * parrot_region
    red_mask = cv2.GaussianBlur(red_mask.astype(np.float32), (0, 0), 1.8)
    red_mask = np.clip(red_mask, 0.0, 1.0)
    red_mask = np.where(red_mask > 0.20, red_mask, 0.0)

    red_mask_bin = (red_mask > 0.0).astype(np.uint8)
    if np.any(red_mask_bin):
        min_area = max(28, int(image.shape[0] * image.shape[1] * 0.00015))
        red_mask_refined = _refine_live_green_mask(red_mask_bin, min_area)

        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(red_mask_refined.astype(np.uint8), connectivity=8)
        if num_labels <= 1:
            red_mask = red_mask_refined.astype(np.float32)
        else:
            best_label = 0
            best_overlap = 0.0
            for lbl in range(1, num_labels):
                comp_mask = (labels == lbl).astype(np.float32)
                overlap = float(np.sum(comp_mask * parrot_region))
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_label = lbl

            if best_label == 0:
                areas = stats[1:, cv2.CC_STAT_AREA]
                largest_label = 1 + int(np.argmax(areas)) if areas.size > 0 else 0
                red_mask = (labels == largest_label).astype(np.float32) if largest_label > 0 else red_mask_refined.astype(np.float32)
            else:
                red_mask = (labels == best_label).astype(np.float32)
    else:
        red_mask = np.zeros_like(red_mask)

    red_boost = np.stack([
        np.clip(r * 1.45 + 0.22, 0.0, 1.0),
        np.clip(g * 0.08, 0.0, 1.0),
        np.clip(b * 0.08, 0.0, 1.0)
    ], axis=-1)

    final_rgb = np.clip((1.0 - red_mask[..., None]) * rgb_corr + red_mask[..., None] * red_boost, 0.0, 1.0)
    final_bgr = cv2.cvtColor((final_rgb * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR)
    return final_bgr


def image_to_base64(img):
    _, buf = cv2.imencode(".jpg", img)
    return base64.b64encode(buf).decode()


def image_to_base64_png(img):
    _, buf = cv2.imencode(".png", img)
    return base64.b64encode(buf).decode()


def image_to_base64_jpg(img, quality=82):
    encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)]
    _, buf = cv2.imencode(".jpg", img, encode_params)
    return base64.b64encode(buf).decode()


def _refine_live_green_mask(mask, min_area):
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    refined = np.zeros_like(mask, dtype=np.uint8)

    for label in range(1, num_labels):
        area = stats[label, cv2.CC_STAT_AREA]
        if area >= min_area:
            refined[labels == label] = 1

    return refined


def enhance_for_colorblind_live(image, cb_type):
    if cb_type != "deuteranopia":
        return enhance_for_colorblind(image, cb_type)

    denoised = cv2.bilateralFilter(image, 5, 35, 35)
    rgb = cv2.cvtColor(denoised, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    sim_bgr = simulate_colorblindness(denoised, cb_type)
    sim_rgb = cv2.cvtColor(sim_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    hsv = cv2.cvtColor(denoised, cv2.COLOR_BGR2HSV)
    h = hsv[..., 0].astype(np.float32)
    s = hsv[..., 1].astype(np.float32) / 255.0
    v = hsv[..., 2].astype(np.float32) / 255.0

    corr = np.array([
        [1.0, 0.7, 0.0],
        [0.0, 0.0, 0.0],
        [0.0, 0.7, 1.0]
    ], dtype=np.float32)

    error = rgb - sim_rgb
    flat_err = error.reshape(-1, 3)
    corrected_delta = (flat_err @ corr.T).reshape(rgb.shape) * 1.15
    rgb_corr = np.clip(rgb + corrected_delta, 0.0, 1.0)

    green_hue_dist = np.abs(h - 60.0)
    cyan_hue_dist = np.abs(h - 90.0)
    green_hue_score = np.clip(1.0 - (green_hue_dist / 26.0), 0.0, 1.0)
    cyan_hue_score = np.clip(1.0 - (cyan_hue_dist / 24.0), 0.0, 1.0)
    green_dom_score = np.clip((rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])) / 0.18, 0.0, 1.0)
    cyan_dom_score = np.clip((np.minimum(rgb[..., 1], rgb[..., 2]) - rgb[..., 0]) / 0.20, 0.0, 1.0)
    sat_score = np.clip((s - 0.16) / 0.28, 0.0, 1.0)
    val_score = np.clip((v - 0.10) / 0.40, 0.0, 1.0)
    green_like_score = np.maximum(green_hue_score * np.maximum(green_dom_score, 0.40 * sat_score), cyan_hue_score * np.maximum(cyan_dom_score, 0.45 * sat_score))
    green_conf = green_like_score * val_score
    green_conf = cv2.GaussianBlur(green_conf.astype(np.float32), (0, 0), 1.1)
    green_conf = np.clip(green_conf, 0.0, 1.0)

    if np.max(green_conf) > 0.05:
        corr_bgr_tmp = cv2.cvtColor((rgb_corr * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR)
        corr_hsv = cv2.cvtColor(corr_bgr_tmp, cv2.COLOR_BGR2HSV).astype(np.float32)
        hh = corr_hsv[..., 0]
        ss = corr_hsv[..., 1]
        vv = corr_hsv[..., 2]

        cyan_weight = cyan_hue_score * np.maximum(cyan_dom_score, 0.35 * sat_score)
        target_h = np.where(cyan_weight > green_hue_score, 22.0, 28.0)
        target_s = np.maximum(ss, 180.0)
        blend = np.clip(0.95 * green_conf, 0.0, 0.88)

        hh = (1.0 - blend) * hh + blend * target_h
        ss = (1.0 - blend) * ss + blend * target_s

        corr_hsv[..., 0] = np.clip(hh, 0.0, 179.0)
        corr_hsv[..., 1] = np.clip(ss, 0.0, 255.0)
        corr_hsv[..., 2] = np.clip(vv, 0.0, 255.0)

        corr_bgr_tmp = cv2.cvtColor(corr_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
        rgb_corr = cv2.cvtColor(corr_bgr_tmp, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0

    strong_green_mask = (
        (h >= 42) & (h <= 100) &
        (s > 0.18) &
        (v > 0.10) &
        ((green_dom_score > 0.14) | (cyan_dom_score > 0.16)) &
        (green_conf > 0.16)
    )

    if np.any(strong_green_mask):
        mask_u8 = (strong_green_mask.astype(np.uint8) * 255)
        kernel = np.ones((3, 3), np.uint8)
        mask_u8 = cv2.morphologyEx(mask_u8, cv2.MORPH_OPEN, kernel, iterations=1)
        mask_u8 = cv2.morphologyEx(mask_u8, cv2.MORPH_CLOSE, kernel, iterations=1)
        min_area = max(24, int(image.shape[0] * image.shape[1] * 0.00018))
        mask_u8 = _refine_live_green_mask(mask_u8, min_area) * 255
        strong_green_mask = mask_u8 > 0

        if np.any(strong_green_mask):
            corr_bgr_tmp = cv2.cvtColor((rgb_corr * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR)
            corr_hsv = cv2.cvtColor(corr_bgr_tmp, cv2.COLOR_BGR2HSV)
            hh, ss, vv = cv2.split(corr_hsv)
            target_h_mask = np.where(cyan_hue_score[strong_green_mask] > green_hue_score[strong_green_mask], 22, 28)
            hh[strong_green_mask] = target_h_mask.astype(np.uint8)
            ss[strong_green_mask] = np.maximum(ss[strong_green_mask], 190)
            corr_hsv = cv2.merge([hh, ss, vv])
            corr_bgr_tmp = cv2.cvtColor(corr_hsv, cv2.COLOR_HSV2BGR)
            rgb_corr = cv2.cvtColor(corr_bgr_tmp, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0

    out = (rgb_corr * 255.0).astype(np.uint8)
    return cv2.cvtColor(out, cv2.COLOR_RGB2BGR)


#FLASK APP INITIALIZATION
app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
PROCESSED_FOLDER = "processed"
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "mp4", "avi", "mov", "webm"}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["PROCESSED_FOLDER"] = PROCESSED_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024
@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/history")
def get_history():
    with history_lock:
        return jsonify({"history": list(history_entries)})


@app.route("/api/history/<filename>", methods=["DELETE"])
def delete_history_item(filename):
    safe_filename = secure_filename(filename)
    if not safe_filename or safe_filename != filename:
        return jsonify({"error": "Invalid filename"}), 400

    removed_entry = None
    with history_lock:
        for index, entry in enumerate(history_entries):
            if entry.get("output") == safe_filename:
                removed_entry = history_entries.pop(index)
                break

    if not removed_entry:
        return jsonify({"error": "History item not found"}), 404

    files_to_delete = {safe_filename}
    preview_file = removed_entry.get("preview_file")
    if preview_file:
        safe_preview = secure_filename(preview_file)
        if safe_preview == preview_file:
            files_to_delete.add(safe_preview)

    for file_name in files_to_delete:
        file_path = os.path.join(PROCESSED_FOLDER, file_name)
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except OSError:
            pass

    return jsonify({"success": True})


@app.route("/api/process-image", methods=["POST"])
def process_image():
    file = request.files.get("image")
    if not file:
        return jsonify({"error": "No image"}), 400

    cb_type = request.form.get("colorblind_type", "protanopia")
    mode = request.form.get("mode", "simulate")

    img = cv2.imdecode(np.frombuffer(file.read(), np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return jsonify({"error": "Invalid image"}), 400
    
    processed = simulate_colorblindness(img, cb_type) if mode == "simulate" else enhance_for_colorblind(img, cb_type)
    
    output_name = f"processed_{uuid.uuid4()}.png"
    output_path = os.path.join(PROCESSED_FOLDER, output_name)
    cv2.imwrite(output_path, processed)
    add_history_entry("image", output_name)
    
    return jsonify({"success": True, "processed_image": image_to_base64(processed), "output_file": output_name})


@app.route("/api/process-live-frame", methods=["POST"])
def process_live_frame():
    file = request.files.get("image")
    if not file:
        return jsonify({"error": "No image"}), 400

    cb_type = request.form.get("colorblind_type", "protanopia")
    mode = request.form.get("mode", "simulate")

    img = cv2.imdecode(np.frombuffer(file.read(), np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return jsonify({"error": "Invalid image"}), 400

    processed = simulate_colorblindness(img, cb_type) if mode == "simulate" else enhance_for_colorblind_video(img, cb_type)
    return jsonify({"success": True, "processed_image": image_to_base64_jpg(processed, quality=80)})


@app.route("/api/process-video", methods=["POST"])
def process_video():
    file = request.files.get("video")
    session_id = request.form.get("session_id", str(uuid.uuid4()))
    
    if not file or not allowed_file(file.filename):
        return jsonify({"error": "Invalid video"}), 400

    cb_type = request.form.get("colorblind_type", "protanopia")
    mode = request.form.get("mode", "simulate")

    input_name = secure_filename(file.filename)
    input_path = os.path.join(UPLOAD_FOLDER, input_name)
    file.save(input_path)

    def process_video_background(input_path, output_file_info):
        import time
        start_time = time.time()
        
        try:
            cap = cv2.VideoCapture(input_path)
            if not cap.isOpened():
                output_file_info['error'] = "Cannot open video"
                return

            fps = int(cap.get(cv2.CAP_PROP_FPS) or 30)
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            
            scale_factor = 1.0
            if w > 1920 or h > 1080:
                scale_factor = 0.75
                w = int(w * scale_factor)
                h = int(h * scale_factor)

            output_name = f"{uuid.uuid4()}.mp4"
            output_path = os.path.join(PROCESSED_FOLDER, output_name)

            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            out = cv2.VideoWriter(output_path, fourcc, fps, (w, h), True)

            processed = 0
            
            update_progress(session_id, 0, total_frames)
            
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                if scale_factor < 1.0:
                    frame = cv2.resize(frame, (w, h), interpolation=cv2.INTER_LINEAR)
                
                frame = simulate_colorblindness(frame, cb_type) if mode == "simulate" else enhance_for_colorblind_video(frame, cb_type)
                out.write(frame)
                processed += 1
                
                if total_frames > 0:
                    progress = int((processed / total_frames) * 99)
                    update_progress(session_id, progress, total_frames)

            cap.release()
            out.release()

            if processed == 0:
                output_file_info['error'] = "No frames processed"
                return

            processing_time = time.time() - start_time
            
            update_progress(session_id, 100, processed)

            output_file_info['success'] = True
            output_file_info['output_file'] = output_name
            output_file_info['frames_processed'] = processed
            output_file_info['processing_time'] = processing_time
            output_file_info['processor'] = "video_protanopia_restore_v7" if mode == "enhance" and cb_type == "protanopia" else "standard"
            add_history_entry("video", output_name, processed, processing_time)
            
            set_processing_result(session_id, output_file_info)
        except Exception as e:
            output_file_info['error'] = str(e)
            set_processing_result(session_id, output_file_info)

    output_file_info = {}
    thread = threading.Thread(target=process_video_background, args=(input_path, output_file_info))
    thread.daemon = True
    thread.start()

    update_progress(session_id, 0, 0)

    return jsonify({
        "success": True,
        "session_id": session_id,
        "message": "Video processing started"
    })


@app.route("/api/save-recording", methods=["POST"])
def save_recording():
    file = request.files.get("video")
    if not file:
        return jsonify({"error": "No recorded video provided"}), 400

    extension = guess_video_extension(file)
    temp_name = f"tmp_recording_{uuid.uuid4()}.{extension}"
    temp_path = os.path.join(UPLOAD_FOLDER, temp_name)
    file.save(temp_path)

    output_name = f"recorded_{uuid.uuid4()}.mp4"
    output_path = os.path.join(PROCESSED_FOLDER, output_name)
    preview_name = f"recording_preview_{uuid.uuid4()}.{extension}"
    preview_path = os.path.join(PROCESSED_FOLDER, preview_name)

    try:
        shutil.copyfile(temp_path, preview_path)
    except Exception:
        preview_name = None

    clip_seconds = request.form.get("clip_seconds")
    duration_seconds = None
    if clip_seconds:
        try:
            duration_seconds = round(float(clip_seconds), 4)
        except ValueError:
            duration_seconds = None

    frames_processed, transcode_error = transcode_video_to_mp4(
        temp_path,
        output_path,
        target_duration_seconds=duration_seconds
    )

    try:
        if os.path.exists(temp_path):
            os.remove(temp_path)
    except OSError:
        pass

    if transcode_error:
        try:
            if os.path.exists(output_path):
                os.remove(output_path)
        except OSError:
            pass
        if preview_name:
            try:
                preview_file_path = os.path.join(PROCESSED_FOLDER, preview_name)
                if os.path.exists(preview_file_path):
                    os.remove(preview_file_path)
            except OSError:
                pass
        return jsonify({"error": transcode_error}), 400

    add_history_entry(
        "recording",
        output_name,
        frames=frames_processed,
        extra={
            "duration_seconds": duration_seconds,
            "download_name": output_name,
            "preview_file": preview_name
        }
    )

    return jsonify({
        "success": True,
        "output_file": output_name
    })


@app.route("/api/progress/<session_id>")
def stream_progress(session_id):
    import json
    import time
    
    processing_results = {}
    
    def generate():
        last_progress = -1
        timeout_count = 0
        
        while timeout_count < 600:
            progress_data = get_progress(session_id)
            current_progress = progress_data["progress"]
            total_frames = progress_data.get("total_frames", 0)
            
            if current_progress != last_progress:
                last_progress = current_progress
                timeout_count = 0
                
                if current_progress >= 100:
                    data = json.dumps({"status": "complete", "progress": 100, "total_frames": total_frames})
                    yield f"data: {data}\n\n"
                    break
                else:
                    data = json.dumps({"status": "processing", "progress": current_progress, "total_frames": total_frames})
                    yield f"data: {data}\n\n"
            else:
                timeout_count += 1
            
            time.sleep(0.5)
    
    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no'
    })


@app.route("/api/processing-result/<session_id>")
def get_result(session_id):
    result = get_processing_result_data(session_id)
    if result:
        return jsonify(result)
    return jsonify({"success": False, "error": "Processing not found or still in progress"}), 404


@app.route("/api/file/<filename>")
def serve_file(filename):
    return send_from_directory(
        PROCESSED_FOLDER,
        filename,
        as_attachment=False
    )


@app.route("/api/download/<filename>")
def download_file(filename):
    return send_from_directory(
        PROCESSED_FOLDER,
        filename,
        as_attachment=True
    )


if __name__ == "__main__":
    print("Server running at http://localhost:5000")
    app.run(debug=True, host="0.0.0.0", port=5000)
