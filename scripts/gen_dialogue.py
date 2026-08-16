#!/usr/bin/env python3
"""Render a two-speaker conversation to a single clip.

Listen to a Conversation is the first task where one audio file contains
two people. Each turn is rendered with its own Piper voice, the turns are
joined with a short pause, and the whole thing is encoded once -- so the
student hears one continuous exchange rather than separate files.
"""
import subprocess, wave, os, sys, json

MODELS = '/tmp/pipertest'
TURN_GAP_SEC = 0.28   # natural beat between speakers; longer sounds staged

def render_turn(text, model, out_wav):
    subprocess.run(['python3','-m','piper','-m',os.path.join(MODELS,model),'-f',out_wav],
                   input=text.encode(), check=True, capture_output=True)

def concat_wavs(paths, out_path, gap_sec=TURN_GAP_SEC):
    with wave.open(paths[0],'rb') as w0:
        params = w0.getparams()
    silence = b'\x00' * int(params.framerate * gap_sec) * params.sampwidth * params.nchannels
    with wave.open(out_path,'wb') as out:
        out.setparams(params)
        for i, p in enumerate(paths):
            with wave.open(p,'rb') as w:
                assert w.getframerate() == params.framerate, 'voices differ in sample rate'
                out.writeframes(w.readframes(w.getnframes()))
            if i < len(paths)-1:
                out.writeframes(silence)

def render_dialogue(turns, voices, out_m4a, bitrate='32000'):
    """turns: [{'s':'M'|'W','t':text}]   voices: {'M':model, 'W':model}"""
    tmp=[]
    for i,t in enumerate(turns):
        p=f'/tmp/_d{i}.wav'; render_turn(t['t'], voices[t['s']], p); tmp.append(p)
    joined='/tmp/_djoin.wav'
    concat_wavs(tmp, joined)
    subprocess.run(['afconvert','-f','mp4f','-d','aac','-b',bitrate,joined,out_m4a],
                   check=True, capture_output=True)
    for p in tmp+[joined]:
        if os.path.exists(p): os.remove(p)
    return os.path.getsize(out_m4a)

if __name__ == '__main__':
    turns=[{'s':'W','t':'Do you need anything from the supermarket?'},
           {'s':'M','t':"Sorry? Are we not about to leave for the play?"},
           {'s':'W','t':'That is tomorrow evening, not tonight.'},
           {'s':'M','t':'Oh. I would lose my head if it were not attached.'},
           {'s':'W','t':'So you were not planning to cook, then?'},
           {'s':'M','t':'Not really, but I can. What would you like?'},
           {'s':'W','t':'Something light. Could you go to the shop instead?'},
           {'s':'M','t':'Of course. How does fish and a salad sound?'},
           {'s':'W','t':'That sounds perfect. Thank you.'}]
    size = render_dialogue(turns, {'W':'en_US-lessac-high.onnx','M':'en_US-ryan-high.onnx'}, '/tmp/dialogue_test.m4a')
    o=subprocess.run(['afinfo','/tmp/dialogue_test.m4a'],capture_output=True,text=True).stdout
    import re; d=re.search(r'estimated duration: ([0-9.]+)', o)
    print('turnos:', len(turns), '| duracao: %.1fs' % float(d.group(1)), '| tamanho: %d KB' % (size//1024))
    print('ETS real: 17-30s, mediana 27s')
