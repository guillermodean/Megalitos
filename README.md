# Megalitos

Página web alojada en los servidores de la SCN Gorosti desarrollada para la divulación del material recogido relativo a las estaciones megalíticas de Navarra

Guillermo.

Recuperamos aquí, en formato digital y después de muchos años, el legado que Miguel Ezkurdia donó a la Sociedad de Ciencias Naturales Gorosti Natur Zientzi Elkartea.
Era nuestro deber como depositarios del mismo el hacer este esfuerzo y que su trabajo de tantos años quede, al menos en la medida de lo posible, disponible para las generaciones actuales y las venideras.

Dr. Juan Ignacio Dean

Desarrollada usando:
NODEJS
EXPRESS
Handlebars

BBDD => Mysql

Test de la API:
supertest, Mocha

Preparada para ser lanzada en servidor HEROKU

Desplegada en https://megalitosnavarra.herokuapp.com/

Preparada para desplegar con docker:

docker pull megalitos-navarra
docker run -d -p 3000:8000 megalitos-navarra