"""Достаёт серверные скрипты крафтов из кэша клиента и переводит их в читаемый вид.

Сервер HiTech при входе присылает клиенту скомпилированные скрипты CraftTweaker,
а клиент кладёт их в config/scripts_cache.dat (Java-сериализованный TreeMap<String, byte[]>
с .class-файлами). Файл уже лежит на диске игрока, читаем его без модов и без запросов к серверу.

Запуск (нужен JDK, т.е. javap в PATH):
    python3 extract.py путь/к/scripts_cache.dat папка_для_zs
"""
import os, struct, subprocess, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dezen


def read_cache(path):
    d = open(path, 'rb').read()
    i = d.index(b'xppw\x04') + 5
    n = struct.unpack('>I', d[i:i + 4])[0]; i += 4
    out = {}
    for _ in range(n):
        assert d[i] == 0x74
        L = struct.unpack('>H', d[i + 1:i + 3])[0]
        name = d[i + 3:i + 3 + L].decode('utf8'); i += 3 + L
        assert d[i] == 0x75; i += 1
        if d[i] == 0x72:  # описание класса [B
            L = struct.unpack('>H', d[i + 1:i + 3])[0]; i += 3 + L + 8 + 1 + 2
            assert d[i] == 0x78; i += 1
            assert d[i] == 0x70; i += 1
        elif d[i] == 0x71:  # ссылка на уже описанный класс
            i += 5
        else:
            raise ValueError(hex(d[i]))
        sz = struct.unpack('>I', d[i:i + 4])[0]; i += 4
        out[name] = d[i:i + sz]; i += sz
    return out


def main(cache, outdir):
    os.makedirs(outdir, exist_ok=True)
    classes = read_cache(cache)
    with tempfile.TemporaryDirectory() as tmp:
        for name, b in sorted(classes.items()):
            if '.' in name or name.startswith('__'):
                continue  # служебные классы ZenScript, не скрипты
            cp = os.path.join(tmp, name + '.class')
            open(cp, 'wb').write(b)
            lines = dezen.run(cp)
            open(os.path.join(outdir, name + '.zs'), 'w').write('\n'.join(lines) + ('\n' if lines else ''))
    print(len(os.listdir(outdir)), 'скриптов ->', outdir)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
