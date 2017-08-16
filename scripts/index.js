/*
	@TODO
	1. Handling the case where no data is returned.
	2. Showing the loading icon before data loads.
	3. Separate concerns in the code.
	4. Writing unit tests
*/
var app = angular.module("sf-muni", []);
app.controller("VehicleController", ["$scope", "$http", "$interval", function($scope, $http, $interval) {
	//Width and height
	var baseUrl = "http://webservices.nextbus.com/service/publicJSONFeed?a=sf-muni&",
		projection = d3.geoMercator().scale(1).translate([0, 0]),
		path = d3.geoPath().projection(projection),
		width="700",
		height="500",
		svg = d3.select("svg").attr("width", width).attr("height", height),
		bounds, scale, translate;

	d3.queue()
		.defer(d3.json, "assets/maps/neighborhoods.json", prepareMap)
		.defer(d3.json, "assets/maps/streets.json", prepareMap)
		.awaitAll(function(error) {
			if (error) {
				throw error;
			} else {
				console.log("Maps loaded successfully");
			}
		});

	function prepareMap(json) {
		// Calculate bounding box transforms for entire collection
		if (undefined === bounds) {
			prepareBounds(json);
		}

		//Bind data and create one path per GeoJSON feature
		if (json["use-case"] === "neighborhoods") {
			svg.selectAll("path").data(json.features).enter().append("path").attr("d", path).attr("name", "neighborhood");
		} else {
			svg.selectAll("path").data(json.features).enter().append("path").attr("d", path);
		}
	}

	function prepareBounds(json) {
		bounds = path.bounds(json),
				scale = .95 / Math.max((bounds[1][0] - bounds[0][0]) / width, (bounds[1][1] - bounds[0][1]) / height),
				translate = [
				(width - scale * (bounds[1][0] + bounds[0][0])) / 2,
				(height - scale * (bounds[1][1] + bounds[0][1])) / 2
			];

		// Update the projection
		projection.scale(scale).translate(translate);
	}

	function fetchVehiclesByRoute() {
		$http({
			method: "GET",
			url: baseUrl + "command=routeList"
		}).then(function successCallback(response) {
			$scope.routes = response.data.route;
			$scope.selectedRoute = $scope.routes[0];
			$scope.getVehicleLocations();
			$interval($scope.getVehicleLocations, 15000, false, 0);
		});
	}

	function drawVehicle(vehicle) {
		let x = projection([vehicle.lon, vehicle.lat])[0],
			y = projection([vehicle.lon, vehicle.lat])[1];

		svg.append("svg:image")
			.attr("xlink:href", "assets/images/icon.svg")
			.attr("id", vehicle.id)
			.attr("name", "buses")
			.attr("width", 10)
			.attr("height", 10)
			.attr("transform", " translate(" + x + ", " + y + ") rotate(" + (-180 + parseInt(vehicle.heading)) + ")");
	}

	$scope.getVehicleLocations = function() {
		$http({
			method: "GET",
			url: baseUrl + "command=vehicleLocations&t=0&r=" + $scope.selectedRoute.tag
		}).then(function successCallback(response) {
			// Remove all the buses and their stops from the previous route.
			removeAllBuses();
			removeAllStops();
			// If selected route has vehicle information.
			if (undefined !== response.data.vehicle) {
				let vehicles = response.data.vehicle;
				vehicles.forEach((vehicle) => {
					drawVehicle(vehicle);
				});
				$scope.drawStopsForRoute();
			} else {
				console.log("No vehicles found for the route:", $scope.selectedRoute.tag);
			}
		}, function errorCallback(response) {
			console.log(response);
		});
	};

	function removeAllBuses() {
		d3.selectAll("[name='buses']").remove();
	}

	function removeAllStops() {
		d3.selectAll("[name='bus-stop']").remove();
	}

	function drawStops(coordinates) {
		svg.append("circle")
			.attr("cx", function (d) { return projection(coordinates)[0]; })
			.attr("cy", function (d) { return projection(coordinates)[1]; })
			.attr("r", "1px")
			.attr("name", "bus-stop")
			.style("fill", "red");
	}

	$scope.drawStopsForRoute = function() {
		$http({
			method: "GET",
			url: baseUrl + "command=routeConfig&terse=true&r=" + $scope.selectedRoute.tag
		}).then(function successCallback(response) {
			let route = response.data.route;
			if (undefined !== route && undefined !== route.direction) {
				let stops = route.stop;
				let stopsByRoute = new Map();
				stops.forEach((stop) => {
					stopsByRoute.set(stop.tag, {
						lat: stop.lat,
						lon: stop.lon,
						title: stop.title
					});
				});

				let directions = route.direction;
				directions.forEach((direction) => {
					if (direction.useForUI) {
						let stops = direction.stop;
						stops.forEach((stop) => {
							let coordinates = [
								stopsByRoute.get(stop.tag).lon,
								stopsByRoute.get(stop.tag).lat
							];
							drawStops(coordinates);
						});
					}
				});
			}
		}, function errorCallback(response) {
			console.log(response);
		});
	};

	$scope.modifyScale = function(increase) {
		let currentZoomLevel = parseFloat(svg.style("zoom"));
		if (increase) {
			currentZoomLevel += currentZoomLevel * 0.10;
		} else {
			currentZoomLevel -= currentZoomLevel * 0.10;
		}

		svg.style("zoom", currentZoomLevel);
	};

	fetchVehiclesByRoute();
}]);