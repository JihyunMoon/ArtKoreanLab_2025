# People Motion + Zone Counter

An interactive OpenCV tool to:
- Detect people in video/webcam
- Draw and save polygon zones
- Count how many people are in each zone per frame
- Estimate average motion percentage across detected people
 - Optional YOLO detector for better accuracy/speed

## Features
- Click to add polygon points; press `n` to start a new zone; `z` to undo last point.
- Save/load zones as JSON with `s`/`l`.
- People detection using OpenCV HOG (no DNN required).
- Motion estimation using background subtraction per-person ROI.
- CSV logging of per-frame counts and motion metrics.

## Install

### Option A: Conda (recommended)

```bash
conda env create -f environment.yml
conda activate motion-zones
```

### Option B: venv (alternative)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

Video file (HOG detector):

```bash
python src/people_motion_zones.py --source path/to/video.mp4 --zones zones.json --csv out.csv
```

Webcam (HOG detector):

```bash
python src/people_motion_zones.py --source 0 --zones zones.json --csv out.csv
```

YOLO detector examples:

CPU or Apple Silicon (Metal/MPS):

```bash
python src/people_motion_zones.py --source 0 --detector yolo --device mps --yolo-model yolov8n.pt --yolo-imgsz 640 --scale 0.5
```

CUDA GPU (if available):

```bash
python src/people_motion_zones.py --source path/to/video.mp4 --detector yolo --device 0 --yolo-model yolov8n.pt --yolo-imgsz 640
```

Adjust confidence threshold:

```bash
python src/people_motion_zones.py --source 0 --detector yolo --yolo-conf 0.35 --yolo-imgsz 640
```

OSC output (per-zone counts)

Enable OSC and send to localhost:9000:

```bash
python src/people_motion_zones.py --source 0 --detector yolo --osc --osc-host 127.0.0.1 --osc-port 9000
```

Message schema:

- Address: `/zone/amount`
- Arguments: `[zone_name: string, count: int]`
- Address: `/avg_motion_rate`
- Arguments: `[motion_percentage: float]`

Example messages:

```text
/zone/amount "Zone 1" 3
/avg_motion_rate 0.75
```

## Keys

- `h`: toggle help overlay
- Mouse `click`: add point to current zone
- `n`: start a new zone (close the previous if 3+ points)
- `z`: undo last point of current zone
- `s`: save zones
- `l`: load zones
- `p`: pause/resume
- `q` or `ESC`: quit

## Notes

- HOG-based detection is CPU-only and may be slow; optionally downscale with `--scale 0.5`.
- Motion percentage is approximate; tune with `--bs-history`, `--bs-thresh`.
- YOLO requires the `ultralytics` package (included in the Conda env). Model weights like `yolov8n.pt` will download on first run.
- For Apple Silicon, try `--device mps` for hardware acceleration; for NVIDIA GPUs, use `--device 0` (or another index).
