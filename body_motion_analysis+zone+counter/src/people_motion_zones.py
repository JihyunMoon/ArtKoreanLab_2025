#!/usr/bin/env python3
import argparse
import json
import os
from dataclasses import dataclass
from typing import List, Tuple, Optional

import cv2
import numpy as np
try:
    from ultralytics import YOLO  # type: ignore
except Exception:
    YOLO = None  # optional dependency
try:
    from pythonosc.udp_client import SimpleUDPClient  # type: ignore
except Exception:
    SimpleUDPClient = None  # optional dependency

Point = Tuple[int, int]
Polygon = List[Point]


@dataclass
class Zone:
    name: str
    points: Polygon


def inside_polygon(pt: Point, poly: Polygon) -> bool:
    # ray casting algorithm
    x, y = pt
    inside = False
    n = len(poly)
    if n < 3:
        return False
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if ((y1 > y) != (y2 > y)):
            xinters = (x2 - x1) * (y - y1) / (y2 - y1 + 1e-9) + x1
            if x < xinters:
                inside = not inside
    return inside


def draw_zones(img, zones: List[Zone], active: Optional[Polygon] = None):
    overlay = img.copy()
    for idx, z in enumerate(zones):
        color = (0, 255, 255)
        if len(z.points) >= 2:
            cv2.polylines(overlay, [np.array(
                z.points, dtype=np.int32)], isClosed=True, color=color, thickness=2)
        for p in z.points:
            cv2.circle(overlay, p, 3, color, -1)
        cv2.putText(overlay, z.name, z.points[0] if z.points else (
            10, 20 + 20*idx), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
    if active is not None and len(active) > 0:
        color = (255, 255, 0)
        cv2.polylines(overlay, [np.array(active, dtype=np.int32)],
                      isClosed=False, color=color, thickness=2)
        for p in active:
            cv2.circle(overlay, p, 3, color, -1)
    cv2.addWeighted(overlay, 0.8, img, 0.2, 0, img)


def save_zones(path: str, zones: List[Zone]):
    data = [{"name": z.name, "points": z.points} for z in zones]
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)


def load_zones(path: str) -> List[Zone]:
    if not os.path.exists(path):
        return []
    with open(path, 'r') as f:
        data = json.load(f)
    zones = [Zone(d.get("name", f"Zone {i+1}"), [tuple(p)
                  for p in d["points"]]) for i, d in enumerate(data)]
    return zones


def setup_hog():
    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    return hog


def detect_people_hog(hog, frame_gray, scale=1.0):
    # HOG works on color or gray; we pass the display-scaled frame
    rects, weights = hog.detectMultiScale(
        frame_gray, winStride=(8, 8), padding=(8, 8), scale=1.05)
    # Non-max suppression
    picks = []
    for i, r in enumerate(rects):
        x, y, w, h = r
        picks.append(
            (x, y, w, h, float(weights[i]) if i < len(weights) else 1.0))
    # We could do further suppression; keep as-is for simplicity
    return picks


def setup_yolo(model_path: str = "yolov8n.pt", device: str = "cpu"):
    if YOLO is None:
        raise RuntimeError(
            "Ultralytics is not installed. Install 'ultralytics' or use --detector hog.")
    # PyTorch 2.6 changed default of torch.load(weights_only=True). Allowlist Ultralytics class for safety.
    try:
        from torch.serialization import add_safe_globals  # type: ignore
        import ultralytics.nn.tasks as u_tasks  # type: ignore
        add_safe_globals([u_tasks.DetectionModel])
    except Exception:
        # If this fails (older torch), it's fine; Ultralytics should handle standard loads.
        pass
    model = YOLO(model_path)
    # Device is handled in predict call; store for use
    return model, device


def detect_people_yolo(model, device: str, frame_bgr, conf_thres: float = 0.25, imgsz: int = 640):
    # Run inference; classes: 0=person for COCO models
    results = model.predict(source=frame_bgr, imgsz=imgsz,
                            conf=conf_thres, device=device, verbose=False, classes=0)
    detections = []
    if not results:
        return detections
    r = results[0]
    if getattr(r, 'boxes', None) is None:
        return detections
    boxes = r.boxes
    xyxy = boxes.xyxy.cpu().numpy() if hasattr(boxes, 'xyxy') else []
    confs = boxes.conf.cpu().numpy() if hasattr(boxes, 'conf') else []
    clss = boxes.cls.cpu().numpy() if hasattr(boxes, 'cls') else []
    for (x1, y1, x2, y2), c, cls in zip(xyxy, confs, clss):
        if int(cls) != 0:
            continue
        x, y, w, h = int(x1), int(y1), int(x2 - x1), int(y2 - y1)
        detections.append((x, y, w, h, float(c)))
    return detections


def centroid_of_bbox(x, y, w, h) -> Point:
    return (int(x + w / 2), int(y + h / 2))


def compute_motion_percent(bfg, frame_gray, detections, motion_thresh=25):
    # returns average motion % across detected person ROIs and per-detection motion
    fgmask = bfg.apply(frame_gray)
    motion_values = []
    for (x, y, w, h, _) in detections:
        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(frame_gray.shape[1], x +
                     w), min(frame_gray.shape[0], y + h)
        roi = fgmask[y1:y2, x1:x2]
        if roi.size == 0:
            motion_values.append(0.0)
            continue
        # threshold to binary motion
        _, thr = cv2.threshold(roi, motion_thresh, 255, cv2.THRESH_BINARY)
        moving = float(np.count_nonzero(thr))
        total = float(roi.size)
        motion_values.append(100.0 * moving / total if total > 0 else 0.0)
    avg_motion = float(np.mean(motion_values)) if motion_values else 0.0
    return avg_motion, motion_values, fgmask


def overlay_info(frame, detections, avg_motion, zones: List[Zone], counts_per_zone, help_on: bool):
    # Draw detections
    for (x, y, w, h, conf) in detections:
        cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 200, 0), 2)
        cv2.putText(frame, f"{conf:.2f}", (x, y-5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 0), 1)
    # Draw zones and counts
    draw_zones(frame, zones)
    for i, z in enumerate(zones):
        cnt = counts_per_zone.get(z.name, 0)
        pos = z.points[0] if z.points else (10, 20 + 20*i)
        cv2.putText(frame, f"{z.name}: {cnt}", pos,
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
    cv2.putText(frame, f"Avg motion: {avg_motion:.1f}%", (10, 25),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

    if help_on:
        lines = [
            "Keys:",
            "h: toggle help",
            "mouse: add point",
            "n: new zone",
            "z: undo point",
            "s: save zones",
            "l: load zones",
            "p: pause",
            "q/ESC: quit",
        ]
        y = 50
        for ln in lines:
            cv2.putText(frame, ln, (10, y), cv2.FONT_HERSHEY_SIMPLEX,
                        0.6, (255, 255, 255), 2)
            y += 22


def main():
    ap = argparse.ArgumentParser(
        description="People Motion + Zone Counter (OpenCV)")
    ap.add_argument("--source", required=True,
                    help="Video path or camera index (e.g., 0)")
    ap.add_argument("--zones", default="zones.json", help="Path to zones JSON")
    ap.add_argument("--csv", default=None, help="Optional CSV output path")
    ap.add_argument("--scale", type=float, default=1.0,
                    help="Resize factor for processing/display")
    ap.add_argument("--bs-history", type=int, default=300,
                    help="Background subtractor history")
    ap.add_argument("--bs-thresh", type=int, default=25,
                    help="Motion threshold (0-255)")
    ap.add_argument("--detector", choices=["hog", "yolo"], default="hog",
                    help="People detector to use")
    ap.add_argument("--yolo-model", default="yolov8n.pt",
                    help="Ultralytics YOLO model path or name (e.g., yolov8n.pt)")
    ap.add_argument("--yolo-conf", type=float, default=0.25,
                    help="YOLO confidence threshold")
    ap.add_argument("--device", default="cpu",
                    help="Compute device for YOLO (e.g., cpu, mps for Apple Silicon, 0 for CUDA)")
    ap.add_argument("--yolo-imgsz", type=int, default=640,
                    help="YOLO inference image size (e.g., 640)")
    ap.add_argument("--osc", action="store_true",
                    help="Enable OSC output of zone counts")
    ap.add_argument("--osc-host", default="127.0.0.1", help="OSC target host")
    ap.add_argument("--osc-port", type=int,
                    default=9000, help="OSC target port")
    args = ap.parse_args()

    # Source open
    source = args.source
    if source.isdigit():
        cap = cv2.VideoCapture(int(source))
    else:
        cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print("Failed to open source", source)
        return

    # Detector selection and background subtractor
    hog = None
    yolo = None
    device = args.device
    if args.detector == "hog":
        hog = setup_hog()
    else:
        try:
            yolo, device = setup_yolo(args.yolo_model, device)
        except Exception as e:
            print("Failed to init YOLO:", e)
            print("Falling back to HOG detector.")
            hog = setup_hog()
    # Background subtractor for motion percentage
    bfg = cv2.createBackgroundSubtractorMOG2(
        history=args.bs_history, varThreshold=16, detectShadows=False)
    # Zones
    zones: List[Zone] = load_zones(args.zones)

    active_poly: Polygon = []
    zone_counter = len(zones)

    help_on = True
    paused = False
    osc_client = None
    if args.osc:
        if SimpleUDPClient is None:
            print(
                "python-osc not installed; cannot enable OSC. Disable --osc or install python-osc.")
        else:
            try:
                osc_client = SimpleUDPClient(args.osc_host, args.osc_port)
                print(f"OSC enabled -> {args.osc_host}:{args.osc_port}")
            except Exception as e:
                print("Failed to init OSC:", e)
                osc_client = None

    window = "PeopleMotionZones"
    cv2.namedWindow(window, cv2.WINDOW_NORMAL)

    # Mouse callback for drawing zones
    state = {"active": active_poly}

    def on_mouse(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            state["active"].append((int(x), int(y)))
    cv2.setMouseCallback(window, on_mouse)

    # CSV logger
    csv_f = None
    if args.csv:
        csv_f = open(args.csv, 'w')
        # header: frame,count_total,avg_motion,zone1,zone2,...
        header = ["frame", "count_total", "avg_motion"] + \
            [z.name for z in zones]
        csv_f.write(",".join(header) + "\n")

    frame_idx = 0

    while True:
        if not paused:
            ok, frame = cap.read()
            if not ok:
                break
            if args.scale != 1.0:
                frame = cv2.resize(frame, None, fx=args.scale, fy=args.scale)
            frame_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            if hog is not None:
                detections = detect_people_hog(hog, frame)
            else:
                detections = detect_people_yolo(
                    yolo, device, frame, conf_thres=args.yolo_conf, imgsz=args.yolo_imgsz)
            avg_motion, motion_values, fgmask = compute_motion_percent(
                bfg, frame_gray, detections, motion_thresh=args.bs_thresh)

            # Zone counts
            counts_per_zone = {z.name: 0 for z in zones}
            for (x, y, w, h, conf) in detections:
                c = centroid_of_bbox(x, y, w, h)
                for z in zones:
                    if inside_polygon(c, z.points):
                        counts_per_zone[z.name] += 1

            overlay_info(frame, detections, avg_motion,
                         zones, counts_per_zone, help_on)

            # OSC send metrics
            if osc_client is not None:
                # average motion percent (0-100)
                try:
                    osc_client.send_message(
                        "/avg_motion_rate", float(avg_motion))
                except Exception:
                    pass
                # per-zone people counts
                for z in zones:
                    try:
                        osc_client.send_message(
                            "/zone/amount", [z.name, int(counts_per_zone.get(z.name, 0))])
                    except Exception:
                        pass

            # (duplicate OSC send block removed)

            # draw active polygon in edit mode
            if len(state["active"]) > 0:
                draw_zones(frame, [], state["active"])

            # CSV log
            if csv_f:
                row = [str(frame_idx), str(len(detections)), f"{avg_motion:.2f}"] + [
                    str(counts_per_zone.get(z.name, 0)) for z in zones]
                csv_f.write(",".join(row) + "\n")

            cv2.imshow(window, frame)
            frame_idx += 1
        # key handling
        key = cv2.waitKey(1) & 0xFF
        if key in (ord('q'), 27):
            break
        elif key == ord('h'):
            help_on = not help_on
        elif key == ord('p'):
            paused = not paused
        elif key == ord('z'):
            if len(state["active"]) > 0:
                state["active"].pop()
        elif key == ord('n'):
            # close active as a new zone if >=3 points
            if len(state["active"]) >= 3:
                zone_counter += 1
                zones.append(
                    Zone(name=f"Zone {zone_counter}", points=state["active"].copy()))
                # update CSV header on-the-fly is tricky; document to create zones before logging
            state["active"].clear()
        elif key == ord('s'):
            # save zones
            save_zones(args.zones, zones)
            print("Saved zones to", args.zones)
        elif key == ord('l'):
            # load zones
            zones = load_zones(args.zones)
            print("Loaded", len(zones), "zones from", args.zones)

    cap.release()
    cv2.destroyAllWindows()
    if csv_f:
        csv_f.close()


if __name__ == "__main__":
    main()
