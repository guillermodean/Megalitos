# Megalitos

Página web alojada en los servidores de la SCN Gorosti desarrollada para la divulación del material recogido relativo a las estaciones megalíticas de Navarra

Guillermo.

## Informacion
---

Recuperamos aquí, en formato digital y después de muchos años, el legado que Miguel Ezkurdia donó a la Sociedad de Ciencias Naturales Gorosti Natur Zientzi Elkartea.
Era nuestro deber como depositarios del mismo el hacer este esfuerzo y que su trabajo de tantos años quede, al menos en la medida de lo posible, disponible para las generaciones actuales y las venideras.

Dr. Juan Ignacio Dean

## Desarrollo
---

### Lenguajes:

* Javascript para la API
* Un poco de python para salsear y dejar bien los archivos y tablas.

### Desarrollada usando:

* NODEJS
* EXPRESS
* Handlebars

### BBDD:

Mysql

### Test de la API:

* Supertest
*  Mocha

### Despliegue:

#### Preparada para ser lanzada en servidor HEROKU

* Desplegada en https://megalitosnavarra.herokuapp.com/

##### Preparada para desplegar con docker:

`docker pull megalitos-navarra`
`docker run -d -p 3000:8000 megalitos-navarra`

## Organización

### Gorosti: 

Gorosti es una sociedad sin ánimo de lucro que se dedica a la FORMACIÓN, INVESTIGACIÓN y DIVULGACIÓN de la Naturaleza en todos sus aspectos.
