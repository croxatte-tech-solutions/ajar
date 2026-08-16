#!/usr/bin/env python3
"""Render every spoken line in the app, one voice per EXERCISE.

Voice policy comes from the real test, not from taste:

  * Within a single exercise the speaker never changes. We confirmed this
    two ways -- all seven official practice tests label every Listen and
    Repeat line "Trainer" and every interview line "Interviewer", and
    measuring the real ETS audio showed the pitch of the seven L&R clips
    clustered within 11 Hz of each other (and the interview clips within
    16 Hz, but ~25 Hz away from the L&R speaker).

  * Across exercises the speaker DOES change, including gender: of the
    seven practice tests, four say "repeat what she says" and three say
    "repeat what he says". So rotating voices between exercises is what
    the real test does, not a liberty we are taking.

Each exercise therefore picks its voice deterministically from its own
identity, so regenerating always produces the same assignment.
"""
import json, os, subprocess, sys, collections
from gen_dialogue import render_dialogue

MODELS = '/tmp/pipertest'
# A roster wide enough that neighbouring exercises rarely repeat a voice.
LR_VOICES = [            # the "trainer" speaking to the student
    ('en_US-lessac-high.onnx',   'F/US'),
    ('en_US-ryan-high.onnx',     'M/US'),
    ('en_US-amy-medium.onnx',    'F/US'),
    ('en_US-joe-medium.onnx',    'M/US'),
    ('en_GB-cori-high.onnx',     'F/GB'),
    ('en_US-hfc_female-medium.onnx','F/US'),
    ('en_US-kusal-medium.onnx',  'M/US'),
]
IV_VOICES = [            # the "interviewer" running the research study
    ('en_US-ryan-high.onnx',     'M/US'),
    ('en_US-amy-medium.onnx',    'F/US'),
    ('en_US-joe-medium.onnx',    'M/US'),
    ('en_US-lessac-high.onnx',   'F/US'),
    ('en_GB-alba-medium.onnx',   'F/GB'),
    ('en_US-kusal-medium.onnx',  'M/US'),
]

# Listen to a Conversation is the one task with two people in a single
# clip, so it needs a voice per SPEAKER rather than a voice per exercise.
# Piper has no way to switch voice mid-utterance: each turn is rendered
# with its own model and the turns are joined afterwards.
# The lecturer in an academic talk. A wider roster than the others because
# there are 28 talks and hearing the same voice twice in a session is more
# noticeable over a minute of speech than over one sentence.
TALK_VOICES = ['en_US-lessac-high.onnx', 'en_US-ryan-high.onnx', 'en_GB-cori-high.onnx',
               'en_US-amy-medium.onnx', 'en_US-joe-medium.onnx', 'en_GB-alba-medium.onnx',
               'en_US-hfc_female-medium.onnx', 'en_GB-northern_english_male-medium.onnx',
               'en_US-kusal-medium.onnx']

CONV_M = ['en_US-ryan-high.onnx', 'en_US-joe-medium.onnx',
          'en_US-kusal-medium.onnx', 'en_GB-northern_english_male-medium.onnx']
CONV_W = ['en_US-lessac-high.onnx', 'en_US-amy-medium.onnx',
          'en_US-hfc_female-medium.onnx', 'en_GB-cori-high.onnx', 'en_GB-alba-medium.onnx']

def render_conversation(item, outdir, bitrate='32000'):
    name = str(item['hash']); m4a = os.path.join(outdir, name + '.m4a')
    if os.path.exists(m4a):
        return os.path.getsize(m4a), True
    render_dialogue(item['turns'], {'M': item['voice_m'], 'W': item['voice_w']}, m4a, bitrate)
    return os.path.getsize(m4a), False

def render(text, model, outdir, bitrate='32000'):
    name = str(text['hash']); m4a = os.path.join(outdir, name + '.m4a')
    if os.path.exists(m4a):
        return os.path.getsize(m4a), True
    wav = f'/tmp/_g{name}.wav'
    subprocess.run(['python3','-m','piper','-m',os.path.join(MODELS,model),'-f',wav],
                   input=text['text'].encode(), check=True, capture_output=True)
    subprocess.run(['afconvert','-f','mp4f','-d','aac','-b',bitrate,wav,m4a],
                   check=True, capture_output=True)
    os.remove(wav)
    return os.path.getsize(m4a), False

def main(texts_json, outdir):
    items = json.load(open(texts_json))
    os.makedirs(outdir, exist_ok=True)
    themes = sorted({i['theme'] for i in items})
    assign, used = {}, collections.Counter()
    for i in items:
        key = (i['kind'], i['theme'], i['set'])
        if i['kind'] == 'tk':
            n = themes.index(i['theme']) + i['set'] * 7
            i['voice'] = (TALK_VOICES[n % len(TALK_VOICES)], 'lecturer')
            used['lecturer'] += 1
            continue
        if i['kind'] == 'cv':
            # Pair the two speakers off the theme+set index so the same
            # conversation always sounds like the same two people, and
            # neighbouring conversations rarely reuse a pair.
            n = themes.index(i['theme']) + i['set'] * 5
            i['voice_m'] = CONV_M[n % len(CONV_M)]
            i['voice_w'] = CONV_W[n % len(CONV_W)]
            used['M+W'] += 1
            continue
        if key not in assign:
            roster = LR_VOICES if i['kind'] == 'lr' else IV_VOICES
            if i['kind'] == 'cr':
                # Listen and Choose: the speaker is a peer in a corridor
                # exchange, so the whole theme uses one consistent voice.
                roster = LR_VOICES
            n = themes.index(i['theme']) + (i['set'] * 3)   # stagger the 2 interview sets
            assign[key] = roster[n % len(roster)]
            used[assign[key][1]] += 1
        i['voice'] = assign[key]

    total = made = 0
    for n, i in enumerate(items, 1):
        if i['kind'] == 'cv':
            size, cached = render_conversation(i, outdir)
        else:
            size, cached = render(i, i['voice'][0], outdir)
        total += size; made += 0 if cached else 1
        if n % 25 == 0 or n == len(items):
            print(f'  {n}/{len(items)} clips  ({total//1024} KB so far)', flush=True)
    print(f'\n{len(items)} clips, {made} newly rendered, {total//1024} KB total')
    print('voice spread across exercises:', dict(used))
    per = collections.defaultdict(int)
    for i in items: per[(i['kind'], i['theme'], i['set'])] += 1
    print(f'exercises: {len(per)} (each with a single consistent voice)')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
