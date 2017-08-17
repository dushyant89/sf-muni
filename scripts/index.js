/*
	@TODO
	1. Showing the loading icon before data loads.
	2. Separate concerns in the code.
	3. Writing unit tests.
	5. Method documentation.
*/
angular.module("sf-muni").controller("MapController", ["$scope", "$http", "$interval", "mapsToLoad", "agency",
	function($scope, $http, $interval, mapsToLoad, agency) {
		let baseUrl = "http://webservices.nextbus.com/service/publicJSONFeed?a=" + agency + "&",
			projection = d3.geoMercator().scale(1).translate([0, 0]),
			path = d3.geoPath().projection(projection),
			width="700",
			height="500",
			svg = d3.select("svg").attr("width", width).attr("height", height),
			bounds, scale, translate;
		
		$scope.messagesForUser = {
			show: false
		};

		// Get the queue to defer expensive operations.
		let queue = d3.queue();
		mapsToLoad.forEach((mapToLoad) => {
			// load each map.
			queue.defer(d3.json, mapToLoad, prepareMap);
		});
		// Called once all the operations in the queue are completed.
		queue.awaitAll(function(error) {
			if (error) {
				throw error;
			} else {
				showMessageBanner("success", "Success", "All maps loaded successfully!");
			}
		});

		/**
		 * Prepare the map by appending features
		 * 
		 * @param {JSON} json
		 */
		function prepareMap(json) {
			// The bounds remain the same for the whole map so do not
			// calculate again.
			if (undefined === bounds) {
				calculateBounds(json);
			}

			if (json["use-case"] === "neighborhoods") {
				svg.selectAll("path").data(json.features).enter().append("path").attr("d", path).attr("name", "neighborhood");
			} else {
				svg.selectAll("path").data(json.features).enter().append("path").attr("d", path);
			}
		}

		/**
		 * Calculates the bound of the map and converts the coordinates
		 * of the features to projected coordinates.
		 * @param {JSON} json GeoJson containing the features
		 */
		function calculateBounds(json) {
			// Calculate bounding box transforms for entire dataset.
			bounds = path.bounds(json),
					scale = .95 / Math.max((bounds[1][0] - bounds[0][0]) / width, (bounds[1][1] - bounds[0][1]) / height),
					translate = [
					(width - scale * (bounds[1][0] + bounds[0][0])) / 2,
					(height - scale * (bounds[1][1] + bounds[0][1])) / 2
				];

			// Update the projection.
			projection.scale(scale).translate(translate);
		}

		function fetchVehiclesByRoute() {
			$http({
				method: "GET",
				url: baseUrl + "command=routeList"
			}).then(function successCallback(response) {
				$scope.routes = response.data.route;
				$scope.selectedRoute = $scope.routes[0];
				$scope.getVehicleLocations(true);
				// Get the vehicle locations after every 15 seconds. Every call to the
				// method does not check for scope changes since we dont really change in the scope.
				// If we were then the 3 parameter should be true
				$interval($scope.getVehicleLocations, 15000, 0, false, false);
			});
		}
		
		/**
		 * Plots the vehicle on the map. The vehicle svg is rotated
		 * according to the direction in which the vehicle is headed.
		 * @param {object} vehicle The vehicle object.
		 */
		function drawVehicle(vehicle) {
			let x = projection([vehicle.lon, vehicle.lat])[0],
				y = projection([vehicle.lon, vehicle.lat])[1];

			svg.append("svg:image")
				.attr("xlink:href", "assets/images/up-arrow.svg")
				.attr("id", vehicle.id)
				.attr("name", "vehicles")
				.attr("width", 10)
				.attr("height", 10)
				.attr("transform", " translate(" + x + ", " + y + ") rotate(" + parseInt(vehicle.heading) + ")");
		}

		$scope.getVehicleLocations = function(fetchStopsAlso) {
			$http({
				method: "GET",
				url: baseUrl + "command=vehicleLocations&t=0&r=" + $scope.selectedRoute.tag
			}).then(function successCallback(response) {
				// Remove all the vehicles from the previous route.
				removeAllVehicles();
				// If selected route has vehicle information.
				if (undefined !== response.data.vehicle) {
					let vehicles = response.data.vehicle;
					// If it's a single object and there is no direction info.
					if (!Array.isArray(vehicles) && vehicles.heading < 0) {
						showMessageBanner("error", "Error" , "No vehicles found for this route!");

						return;
					}
					// If it's a single object and there is direction info.
					if (!Array.isArray(vehicles) && vehicles.heading > 0) {
						drawVehicle(vehicles);
					}
					// If it's an array of objects.
					if (Array.isArray(vehicles)) {
						vehicles.forEach((vehicle) => {
							// If the heading is negative means the vehicle is static or not moving.
							if (vehicle.heading > 0) {
								drawVehicle(vehicle);
							}
						});
					}

					if (fetchStopsAlso) {
						// Remove all the stops from the previous route.
						removeAllStops();
						fetchStopsByRoute();
					}
				} else {
					// Remove all the stops from the previous route.
					removeAllStops();
					showMessageBanner("error", "Error" , "No vehicles found for this route!");
				}
			}, function errorCallback(response) {
				showMessageBanner("error", "Error" , response.statusText);
			});
		};

		/**
		 * Method to configure and show the message banner.
		 * 
		 * @param {String} type Type of message, can be error or success. 
		 * @param {String} title Title of the message.
		 * @param {String} description Descriptions of the message.
		 */
		function showMessageBanner(type, title, description) {
			$scope.messagesForUser.show = true;
			$scope.messagesForUser.title = title;
			$scope.messagesForUser.type = type;
			$scope.messagesForUser.description = description;
		}

		function removeAllVehicles() {
			d3.selectAll("[name='vehicles']").remove();
		}

		function removeAllStops() {
			d3.selectAll("[name='vehicle-stop']").remove();
		}

		/**
		 * Draws stops part of different directions of the route.
		 * Stops of different direction have a different color.
		 * @param {Array} coordinates lat-lon of the stop.
		 * @param {String} color color code of the stop.
		 */
		function drawStops(coordinates, color) {
			svg.append("circle")
				.attr("cx", function (d) { return projection(coordinates)[0]; })
				.attr("cy", function (d) { return projection(coordinates)[1]; })
				.attr("r", "1px")
				.attr("name", "vehicle-stop")
				.attr("fill", color);
		}

		function fetchStopsByRoute() {
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
						// New color of stop for each direction so as to distinguish between
						// stops part of a different direction.
						let color = d3.hsl(Math.random() * 360, 100, 60);
						// If the direction is important for the UI.
						if (direction.useForUI) {
							let stops = direction.stop;
							stops.forEach((stop) => {
								let coordinates = [
									stopsByRoute.get(stop.tag).lon,
									stopsByRoute.get(stop.tag).lat
								];
								drawStops(coordinates, color);
							});
						}
					});
				}
			}, function errorCallback(response) {
				console.log(response);
			});
		}

		/**
		 * Increase/decrease the zoom level of the svg map by 10%.
		 * @param {boolean} increase If true then increase the zoom level else decrease.
		 */
		$scope.modifyZoomLevel = function(increase) {
			let currentZoomLevel = parseFloat(svg.style("zoom"));
			if (increase) {
				currentZoomLevel += currentZoomLevel * 0.10;
			} else {
				currentZoomLevel -= currentZoomLevel * 0.10;
			}

			svg.style("zoom", currentZoomLevel);
		};

		fetchVehiclesByRoute();
	}
]);