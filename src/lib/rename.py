# -*- coding: utf-8 -*-
"""
Created on Mon Sep 14 20:07:52 2020

@author: Usuario
"""

import pandas as pd
import os


table=pd.read_csv('/Users/Usuario/Desktop/Megalitos/Megalitos/src/public/img/rename.csv', ';', header=0);

"""Leo el archivo una vez modificado y creado la nueva columna y compruebo la importación"""

print(table);

"""Itero por la tabla la longitud de la tabla"""
for i in range(len(table)):
    
    """Creo las variables donde voy a recoger la información de los nombres viejos y nuevos"""
    src = table.iloc[i,0];
    dst= table.iloc[i,1];
    
    """renombro añadiendo la ruta al variable con los nombres que la he convertido en un string"""
    
    os.rename('/Users/Usuario/Desktop/Megalitos/Megalitos/src/public/img/141208_Megalitos/'+str(src),'/Users/Usuario/Desktop/Megalitos/Megalitos/src/public/img/141208_Megalitos/'+str(dst));


