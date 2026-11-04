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
def short(cls): return cls.split('/')[-1]
def run(path):
    out=subprocess.run(['javap','-c','-constants','-p',path],capture_output=True,text=True).stdout
    lines=[]; stack=[]; loc={}; arrays={}
    for ln in out.splitlines():
        m=re.match(r'\s*\d+: (\w+)\s*(.*)',ln)
        if not m: continue
        op,rest=m.groups(); cm=rest.split('//',1)[1].strip() if '//' in rest else ''
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
            mm=re.search(r'Method (?:([\w/$]+)\.)?([\w<>$]+):(\S+)',cm) or re.search(r'InterfaceMethod ([\w/$]+)\.([\w<>$]+):(\S+)',cm)
            if not mm: continue
            cls,name,desc=mm.groups(); n,ret=parse_desc(desc)
            args=[stack.pop() if stack else '?' for _ in range(n)][::-1]
            recv=None
            if op!='invokestatic': recv=stack.pop() if stack else '?'
            fa=lambda x: '['+', '.join(fa(y) for y in x)+']' if isinstance(x,list) else str(x)
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
        elif op=='new': stack.append('NEW')
        elif op=='getstatic': stack.append(cm.split('Field ')[-1].split(':')[0])
        elif op in('pop','pop2'):
            if stack: stack.pop()
        elif op=='checkcast': pass
        elif op in('i2d','i2l','i2f','l2i','d2i','f2d','d2f'): pass
        elif op in('imul','dmul','iadd','dadd','isub','dsub','idiv','ddiv','lmul','ladd','fmul','fadd'):
            b=stack.pop(); a=stack.pop(); stack.append(f'({a}{"*" if "mul" in op else "+" if "add" in op else "-" if "sub" in op else "/"}{b})')
        elif op=='return': pass
        elif op in('ifeq','ifne','if_icmpge','if_icmplt','goto','if_icmpgt','if_icmple','ifnull','ifnonnull','iinc','arraylength','if_acmpne','if_acmpeq','iflt','ifge','ifgt','ifle'):
            lines.append(f'// {op} {rest.strip()}')
        else: lines.append(f'// ?{op} {rest.strip()}')
    return lines
if __name__=='__main__':
    for l in run(sys.argv[1]): print(l)
