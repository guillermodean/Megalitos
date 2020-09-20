# -*- coding: utf-8 -*-
"""
Created on Tue Sep 15 18:45:32 2020

@author: Guillermo
"""

import MySQLdb as MDB
import pandas as pd
import csv

"""Creo la conexión a la base de datos"""

db=MDB.connect(
        host='localhost',
        user='root',
        db='megalitos',
        password='Guillermo11')
    
table=pd.read_csv('/Users/Usuario/Desktop/Megalitos/Megalitos/src/public/img/rename.csv', ';', header=0);

"""Leo el archivo una vez modificado y creado la nueva columna y compruebo la importación"""

print(table);

"""Itero por la tabla la longitud de la tabla"""
    
for i in range(len(table)):
    
    """Creo las variables donde voy a recoger la información de los nombres viejos y nuevos"""
    
    src = table.iloc[i,0]
    dst= table.iloc[i,1]
    
    """Creo un rango para ir pasando por todas las columnas donde se puede encontrar el nombre"""
    
    for n in xrange(8):
        
            """Asigno la consulta a una variable"""
            curs = db.cursor()
            curs.execute("update fichas set Anexo_path_"+str(n)"= replace(Anexo_path_"+str(n)",'"+str(src)"','"+str(dst)"')")
            db.commit()