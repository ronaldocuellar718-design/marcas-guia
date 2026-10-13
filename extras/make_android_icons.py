"""Genera los íconos de la app Android a partir de docs/icons/icon-512.png"""
import os, glob, shutil
from PIL import Image

src = Image.open('docs/icons/icon-512.png').convert('RGB')
res = 'android/app/src/main/res'
sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
# se quitan los íconos adaptativos de plantilla para que se use el ícono propio
for d in glob.glob(res + '/mipmap-anydpi*'):
    shutil.rmtree(d)
for name, px in sizes.items():
    folder = f'{res}/mipmap-{name}'
    os.makedirs(folder, exist_ok=True)
    img = src.resize((px, px), Image.LANCZOS)
    for f in ('ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'):
        img.save(f'{folder}/{f}')
print('Íconos Android listos')
