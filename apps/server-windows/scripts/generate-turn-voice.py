from pathlib import Path
import subprocess,os,wave,json
# Rebuild the included Italian voice bank using eSpeak NG 1.51 and ffmpeg.
env=os.environ.copy();bin=env.get('ESPEAK_BIN','espeak-ng');dataArgs=['--path='+env['ESPEAK_PATH']] if env.get('ESPEAK_PATH') else [];out=Path(__file__).resolve().parents[1]/'public';meta={};frames=[];offset=0;rate=22050
messages={'test':'Avvisi vocali attivi. Manca un numero al tuo turno in Salumeria.'}
for dep in ['salumeria','macelleria','panetteria','pescheria','pasticceria','gastronomia','ortofrutta']:
 for stage,text in [('ahead-1',f'Manca un numero al tuo turno in {dep}.'),('ahead-2',f'Mancano due numeri al tuo turno in {dep}.'),('next',f'Sei il prossimo in {dep}. Preparati al tuo turno.'),('called',f'È il tuo turno in {dep}. Recati al banco.')]:messages[dep+'-'+stage]=text
for key,text in messages.items():
 subprocess.run([bin,*dataArgs,'-v','it','-s','155','-w','clip.wav',text],env=env,check=True)
 with wave.open('clip.wav') as w:data=w.readframes(w.getnframes());n=len(data)//2
 meta[key]={'offset':offset/rate,'duration':n/rate,'text':text};frames.extend([data,b'\0\0'*int(rate*.15)]);offset+=n+int(rate*.15)
with wave.open('bank.wav','wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(b''.join(frames))
subprocess.run(['ffmpeg','-loglevel','error','-y','-i','bank.wav','-codec:a','libmp3lame','-b:a','40k',str(out/'turn-voice.mp3')],check=True)
(out/'turn-voice.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n');print({'phrases':len(meta),'bytes':(out/'turn-voice.mp3').stat().st_size})
