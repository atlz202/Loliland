import re,sys,subprocess
def parse_desc(desc):
    m=re.match(r'\((.*)\)(.*)',desc); args=m.group(1); ret=m.group(2)
    n=0;i=0
    while i<len(args):
        c=args[i]
        while c=='[': i+=1; c=args[i]
        if c=='L': i=args.index(';',i)
        i+=1; n+=1
    return n,ret
class Iter:
    """Итератор по известной коллекции; по неизвестной выдаёт один символический элемент."""
    def __init__(self, items, label=None):
        self.items = list(items) if items is not None else [f'{label}.element']
        self.i = 0
    def __str__(self): return 'iterator'


def short(cls): return cls.split('/')[-1]
def parse_methods(out):
    """Разбивает вывод javap -c -s на методы: имя -> (дескриптор, [(op, rest, comment)])."""
    methods={}; cur=None
    for ln in out.splitlines():
        h=re.match(r'  (?:[\w.$<>\[\], ]+ )?([\w$<>]+)\(.*\);$',ln)
        if h: cur=[h.group(1),None,[]]; continue
        d=re.match(r'\s+descriptor: (\S+)',ln)
        if d and cur and cur[1] is None:
            cur[1]=d.group(1); methods[cur[0]+cur[1]]=(cur[1],cur[2]); continue
        m=re.match(r'\s*(\d+): (\w+)\s*(.*)',ln)
        if m and cur:
            off,op,rest=m.groups(); cm=rest.split('//',1)[1].strip() if '//' in rest else ''
            cur[2].append((int(off),op,rest,cm))
    return methods


def run(path):
    out=subprocess.run(['javap','-c','-s','-constants','-p',path],capture_output=True,text=True).stdout
    methods=parse_methods(out)
    lines=[]
    entry=[k for k in methods if k.startswith('__script__')]
    if entry:
        execute(methods,entry[0],[],lines,0)
    else:
        for k in methods: execute(methods,k,[],lines,0)
    return lines


def execute(methods,key,args,lines,depth):
    desc,instrs=methods[key]
    stack=[]; loc={str(i):a for i,a in enumerate(args)}
    pos={off:i for i,(off,_,_,_) in enumerate(instrs)}
    pc=0; steps=0; unknown_hits={}
    def unknown(op,tgt):
        k=pc; unknown_hits[k]=unknown_hits.get(k,0)+1
        if unknown_hits[k]==1: lines.append(f'// {op}: условие зависит от игры, ветка не раскрыта')
        return unknown_hits[k]>2
    def num(x):
        try: return int(str(x))
        except ValueError:
            try: return float(str(x))
            except ValueError: return None
    while pc < len(instrs):
        steps+=1
        if steps>2000000: lines.append('// цикл прерван: слишком много шагов'); return None
        off,op,rest,cm=instrs[pc]; pc+=1
        if op in('goto','goto_w'): pc=pos[int(rest.split()[0])]; continue
        if op.startswith('if'):
            tgt=pos[int(rest.split()[0])]
            if op.startswith('if_icmp') or op.startswith('if_acmp'):
                b=stack.pop(); a=stack.pop()
                if op.startswith('if_acmp'): r=(str(a)==str(b)); res=r if op=='if_acmpeq' else not r
                else:
                    a,b=num(a),num(b)
                    if a is None or b is None:
                        if unknown(op,tgt): pc=tgt
                        continue
                    res={'eq':a==b,'ne':a!=b,'lt':a<b,'ge':a>=b,'gt':a>b,'le':a<=b}[op[-2:]]
            elif op in('ifnull','ifnonnull'):
                a=stack.pop(); res=(a=='null')==(op=='ifnull')
            else:
                a=num(stack.pop())
                if a is None:
                    if unknown(op,tgt): pc=tgt
                    continue
                res={'eq':a==0,'ne':a!=0,'lt':a<0,'ge':a>=0,'gt':a>0,'le':a<=0}[op[-2:]]
            if res: pc=tgt
            continue
        if op=='iinc':
            i,c=[x.strip() for x in rest.split(',')[:2]]; v=num(loc.get(i)); loc[i]=str(v+int(c)) if v is not None else '?'; continue
        if op=='arraylength':
            a=stack.pop(); stack.append(str(len(a)) if isinstance(a,list) else f'len({a})'); continue
        if op in('aaload','iaload','daload','baload','laload','faload','caload','saload'):
            i=stack.pop(); a=stack.pop(); ii=num(i)
            stack.append(a[ii] if isinstance(a,list) and isinstance(ii,int) and ii<len(a) else f'{a}[{i}]'); continue
        if op in('irem','ixor','iand','ior','ishl','ishr','iushr','lrem','drem'):
            b=num(stack.pop()); a=num(stack.pop())
            if isinstance(a,(int,float)) and isinstance(b,(int,float)) and not (op in('irem','lrem','drem') and b==0):
                a2,b2=int(a),int(b)
                stack.append(str({'irem':a2%b2 if a2>=0 else -((-a2)%b2),'lrem':a2%b2,'drem':a%b,'ixor':a2^b2,'iand':a2&b2,'ior':a2|b2,'ishl':a2<<b2,'ishr':a2>>b2,'iushr':(a2%(1<<32))>>b2}[op]))
            else: stack.append('?')
            continue
        if op in('ineg','dneg','lneg','fneg'):
            a=num(stack.pop()); stack.append(str(-a) if a is not None else '?'); continue
        if op in('f2i','d2i','l2i','d2l','f2l'):
            a=num(stack.pop()); stack.append(str(int(a)) if a is not None else '?'); continue
        if op in('nop','monitorenter','monitorexit'): continue
        if op=='athrow': return None
        if op=='swap': stack[-1],stack[-2]=stack[-2],stack[-1]; continue
        if op=='dup_x1': v=stack[-1]; stack.insert(-2,v); continue
        if op=='dup2': stack.extend(stack[-2:]); continue
        if op in('ldc','ldc_w','ldc2_w'):
            if cm.startswith('String '): v=cm[7:]; stack.append('<'+v+'>' if ':' in v and ' ' not in v else repr(v))
            else: stack.append(cm.split(' ',1)[1].rstrip('dfL') if ' ' in cm else cm)
        elif op.startswith('iconst_'): stack.append(op[7:].replace('m1','-1'))
        elif op in('bipush','sipush'): stack.append(rest.strip())
        elif op.startswith(('lconst','dconst','fconst')): stack.append(op[-1])
        elif op=='aconst_null': stack.append('null')
        elif re.match(r'[aildf]store',op): idx=(op.split('_')[1] if '_' in op else rest.strip()); loc[idx]=stack.pop() if stack else '?'
        elif re.match(r'[aildf]load',op): idx=(op.split('_')[1] if '_' in op else rest.strip()); stack.append(loc.get(idx,'v'+idx))
        elif op in('anewarray','newarray'): n=stack.pop() if stack else '0'; a=['?']*int(n) if n.isdigit() else []; stack.append(a)
        elif op=='multianewarray': stack.append([])
        elif op=='dup': stack.append(stack[-1] if stack else '?')
        elif op.endswith('astore') and op!='astore' or op in('aastore','iastore','dastore','bastore','lastore','fastore','castore','sastore'):
            v=stack.pop(); i=stack.pop(); a=stack.pop()
            if isinstance(a,list) and str(i).isdigit():
                ii=int(i)
                while len(a)<=ii: a.append('?')
                a[ii]=v
        elif op.startswith('invoke'):
            mm=re.search(r'Method (?:([\w/$]+)\.)?"?([\w<>$]+)"?:(\S+)',cm)
            if not mm: continue
            cls,name,desc=mm.groups(); n,ret=parse_desc(desc)
            args=[stack.pop() if stack else '?' for _ in range(n)][::-1]
            recv=None
            if op!='invokestatic': recv=stack.pop() if stack else '?'
            if op=='invokestatic' and cls is None and (name+desc) in methods and depth<8:
                # функция, объявленная в этом же скрипте: подставляем её тело с аргументами
                r=execute(methods,name+desc,args,lines,depth+1)
                if ret!='V': stack.append(r if r is not None else f"{name}(...)")
                continue
            fa=lambda x: '['+', '.join(fa(y) for y in x)+']' if isinstance(x,list) else ('{'+', '.join(f"{str(k).strip(chr(39))}: {fa(v)}" for k,v in x.items())+'}' if isinstance(x,dict) else str(x))
            if name=='valueOf' and (cls or '').startswith('java/lang/'): stack.append(args[0]); continue
            if name in('doubleValue','intValue','floatValue','longValue'): stack.append(recv); continue
            if name=='entrySet' and isinstance(recv,dict): stack.append(list(recv.items())); continue
            if name=='keySet' and isinstance(recv,dict): stack.append(list(recv.keys())); continue
            if name=='values' and isinstance(recv,dict): stack.append(list(recv.values())); continue
            if name=='get' and isinstance(recv,dict): stack.append(recv.get(args[0],'?')); continue
            if name=='iterator': stack.append(Iter(recv if isinstance(recv,(list,tuple)) else None, fa(recv))); continue
            if name=='hasNext' and isinstance(recv,Iter): stack.append('1' if recv.i<len(recv.items) else '0'); continue
            if name=='next' and isinstance(recv,Iter): stack.append(recv.items[recv.i]); recv.i+=1; continue
            if name=='getKey' and isinstance(recv,tuple): stack.append(recv[0]); continue
            if name=='getValue' and isinstance(recv,tuple): stack.append(recv[1]); continue
            if name=='<init>' and isinstance(recv,dict):
                continue
            if name=='put' and isinstance(recv,dict):
                recv[args[0]]=args[1]; stack.append('null'); continue
            if name=='asData' and (cls or '').startswith('minetweaker/expand'):
                stack.append(fa(args[0])); continue
            if name=='getItem' and 'ItemBracketHandler' in (cls or ''): call=f"{args[0]}" if args[1]=='0' else f"{args[0][:-1]}:{args[1]}>"
            elif name=='getOre' or 'OreBracket' in (cls or ''): call=f"<ore:{str(args[0]).strip(chr(39))}>"
            elif name=='getLiquid' or 'LiquidBracket' in (cls or ''): call=f"<liquid:{str(args[0]).strip(chr(39))}>"
            else:
                target=(fa(recv)+'.' if recv is not None else (short(cls)+'.' if cls else ''))
                call=f"{target}{name}({', '.join(fa(a) for a in args)})"
            if name=='<init>':
                if stack and stack[-1]=='NEW': stack[-1]=call
                continue
            if ret=='V': lines.append(call)
            else: stack.append(call)
        elif op=='new': stack.append({} if 'java/util/HashMap' in cm else 'NEW')
        elif op=='getstatic': stack.append(cm.split('Field ')[-1].split(':')[0])
        elif op in('pop','pop2'):
            if stack: stack.pop()
        elif op=='checkcast': pass
        elif op in('i2d','i2l','i2f','l2i','d2i','f2d','d2f'): pass
        elif op in('imul','dmul','iadd','dadd','isub','dsub','idiv','ddiv','lmul','ladd','fmul','fadd'):
            b=stack.pop(); a=stack.pop(); stack.append(f'({a}{"*" if "mul" in op else "+" if "add" in op else "-" if "sub" in op else "/"}{b})')
        elif op=='return': return None
        elif op in('areturn','ireturn','dreturn','lreturn','freturn'): return stack[-1] if stack else None
        else: lines.append(f'// ?{op} {rest.strip()}')
    return None

if __name__=='__main__':
    for l in run(sys.argv[1]): print(l)
