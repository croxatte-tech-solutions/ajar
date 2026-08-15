#!/usr/bin/env python3
"""Pre-render the app's fixed spoken content to small AAC clips.

Why this exists: the app currently speaks via the browser's built-in
text-to-speech, which means the voice depends entirely on the student's
device. A new iPhone sounds good; an older Android may only have a poor
robotic voice -- so two students doing the SAME exercise get very
different experiences, and in Listen and Repeat a bad voice actively
teaches wrong pronunciation. Pre-rendering makes every student hear the
identical, good voice.

Files are content-addressed: the filename is hashStr(text), the exact
same hash function the app uses. So the app can find a clip with no
manifest, and if a sentence is ever edited the hash changes, the file is
simply not found, and playback falls back to browser TTS instead of
playing the wrong audio.

Voices (Piper, MIT-licensed -- generated audio is redistributable):
  trainer     female US -- Listen and Repeat ("repeat what SHE says")
  interviewer male US   -- Take an Interview (a different person)
Run:  python3 gen_audio.py <voice> <outdir> < texts.txt   (one per line)
"""
import subprocess, sys, os, hashlib

VOICES = {
    'trainer':     'en_US-lessac-high.onnx',
    'interviewer': 'en_US-ryan-high.onnx',
}

def hash_str(s):
    """Mirror of the app's hashStr() -- 32-bit signed wrap, then abs."""
    h = 0
    for ch in s:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
        if h >= 0x80000000:
            h -= 0x100000000
    return abs(h)

def render(text, model, outdir, bitrate='32000'):
    name = str(hash_str(text))
    m4a = os.path.join(outdir, name + '.m4a')
    if os.path.exists(m4a):
        return m4a, os.path.getsize(m4a), True
    wav = os.path.join('/tmp', name + '.wav')
    subprocess.run(['python3', '-m', 'piper', '-m', model, '-f', wav],
                   input=text.encode(), check=True, capture_output=True)
    subprocess.run(['afconvert', '-f', 'mp4f', '-d', 'aac', '-b', bitrate, wav, m4a],
                   check=True, capture_output=True)
    os.remove(wav)
    return m4a, os.path.getsize(m4a), False

if __name__ == '__main__':
    voice, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    model = VOICES[voice]
    texts = [l.rstrip('\n') for l in sys.stdin if l.strip()]
    total = skipped = 0
    for t in texts:
        path, size, cached = render(t, model, outdir)
        total += size
        skipped += 1 if cached else 0
        print(f'{"cached" if cached else "made  "} {size//1024:>4} KB  {os.path.basename(path):>14}  {t[:56]}')
    print(f'\n{len(texts)} clips, {total//1024} KB total ({skipped} already existed)')
