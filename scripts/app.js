var app = angular.module("sf-muni", []);
// Add any feature map here which you want to show add here.
app.value("mapsToLoad", ["assets/maps/neighborhoods.json", "assets/maps/streets.json"]);
app.constant("agency", "sf-muni");