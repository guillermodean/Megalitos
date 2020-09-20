# -*- coding: utf-8 -*-
"""
Created on Mon Sep 14 18:54:50 2020

@author: Usuario
"""

import os
from pandas import DataFrame as df
list=os.listdir('/Users/Usuario/Desktop/Megalitos/Megalitos/src/public/img/141208_Megalitos');
df = df (list,columns=['archivos'])
print (df);
df.head();
df['edicion']=df['archivos']
df.head();
ruta = "/Users/Usuario/Desktop/Megalitos/Megalitos/src/public/img/listado.csv"
"""df.to_csv(ruta);"""