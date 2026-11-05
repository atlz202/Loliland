"""Достаёт продукты пчёл Forestry из forestry_1.7.10-4.2.16.64.jar (байткод BeeDefinition).

    unzip forestry.jar 'forestry/apiculture/*' -d /tmp/forestry && python3 tools/extract_forestry_bees.py /tmp/forestry

Пишет data/bees/forestry_bees.json: вид -> [(тип, сота, мета, шанс)].
"""
import subprocess, re, json, os
import sys
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data/bees/forestry_bees.json')
os.chdir(sys.argv[1] if len(sys.argv) > 1 else '/tmp/forestry')
def jp(cls):
    return subprocess.run(['javap','-p','-c','-constants','-cp','.',cls],capture_output=True,text=True).stdout
# comb enum order
s=jp('forestry.apiculture.items.EnumHoneyComb')
st=s[s.index('static {}'):]
combs=re.findall(r'String (\w+)\n\s+\d+: (?:iconst_\w+|bipush\s+\d+|sipush\s+\d+)',st)
order=[]
for m in re.finditer(r'// String (\w+)\n\s+\d+: (iconst_(\d)|bipush\s+(\d+))',st):
    name=m.group(1); idx=int(m.group(3) or m.group(4))
    order.append((idx,name))
order=sorted(set(order))
comb_idx={n:i for i,n in order}
print('combs',order)
# bee names
s=jp('forestry.apiculture.genetics.BeeDefinition')
st=s[s.index('static {}'):]
cls2name={}
for m in re.finditer(r'class forestry/apiculture/genetics/BeeDefinition\$(\d+)\n\s+\d+: dup\n\s+\d+: ldc(?:_w)?\s+#\d+\s+// String (\w+)',st):
    cls2name[m.group(1)]=m.group(2)
bees={}
for n,name in cls2name.items():
    t=jp(f'forestry.apiculture.genetics.BeeDefinition${n}')
    if 'setSpeciesProperties' not in t: continue
    body=t[t.index('setSpeciesProperties'):]
    body=body[:body.index('return')]
    prods=[];cur=None
    for line in body.splitlines():
        m=re.search(r'EnumHoneyComb\.(\w+)',line)
        if m: cur=('Forestry:beeCombs',comb_idx[m.group(1)],m.group(1)); continue
        m=re.search(r'Field (?:net/minecraft/init/Items|forestry/\S+)\.(\w+):',line)
        if m and 'EnumHoneyComb' not in line and 'items' not in m.group(1): 
            pass
        m=re.search(r'// float ([\d.]+)f',line)
        if m and cur: fl=float(m.group(1)); continue
        m=re.search(r'\.(addProduct|addSpecialty)',line)
        if m and cur:
            prods.append((m.group(1),cur[2],cur[1],fl)); cur=None
    bees[name]=prods
json.dump(bees,open(OUT, 'w'),indent=0)
for b,p in bees.items(): print(b,p)
