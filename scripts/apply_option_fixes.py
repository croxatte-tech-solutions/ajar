# Applies a JSON list of {bank, where, old, new} option rewrites to the right
# bank in index.html. Literal replacement, scoped to that bank's line range,
# and it refuses anything that does not match exactly once — a fix that lands
# in the wrong question is worse than a fix that does not land.
#
#   python3 scripts/apply_option_fixes.py fixes.json           writes index.html
#   python3 scripts/apply_option_fixes.py --into copy.html f.json   writes elsewhere
#
# Use scripts/try_option_fixes.sh instead of calling this directly: it applies
# to a copy first and runs the checks against the copy, so a bad batch never
# reaches index.html.
import io,json,sys,re
args=sys.argv[1:]; p='index.html'; src_p='index.html'
if args[:1]==['--into']: p=args[1]; args=args[2:]
src=io.open(src_p,encoding='utf-8').read(); lines=src.split('\n')
BANKS={'choose-response':'CHOOSE_RESPONSE_BANK','announcement':'ANNOUNCEMENT_BANK',
       'conversation':'CONVERSATION_BANK','talk':'TALK_BANK',
       'daily-read':'DAILY_READ_BANK','passage':'PASSAGE_BANK'}
rng={}
for k,v in BANKS.items():
    st=next(i for i,l in enumerate(lines) if l.startswith('const '+v+' =' ) or l.startswith('const '+v+'='))
    en=next(i for i in range(st+1,len(lines)) if lines[i].startswith('};'))
    rng[k]=(st,en)
applied=skipped=[]
applied=[];skipped=[]
for f in args:
    for x in json.load(io.open(f,encoding='utf8')):
        st,en=rng[x['bank']]
        # The source escapes apostrophes inside single-quoted JS strings.
        old=x['old'].replace("'","\\'"); new=x['new'].replace("'","\\'")
        hits=[i for i in range(st,en+1) if old in lines[i]]
        if len(hits)!=1: skipped.append((x['bank'],x['where'],'matches='+str(len(hits)))); continue
        i=hits[0]
        if lines[i].count(old)!=1: skipped.append((x['bank'],x['where'],'ambiguous in line')); continue
        lines[i]=lines[i].replace(old,new,1); applied.append(x['where'])
io.open(p,'w',encoding='utf-8').write('\n'.join(lines))
print('applied',len(applied),'skipped',len(skipped))
for s in skipped: print('  SKIP',s)
