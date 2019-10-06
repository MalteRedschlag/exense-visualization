registerScript();

angular.module('viz-dashlet', ['viz-query', 'dashletcomssrv'])
    .directive('vizDashlet', function () {

        var controllerScript = 'viz-dashlet.js';
        var aggTemplateUrl = resolveTemplateURL(controllerScript, 'viz-dashlet-aggregated.html');
        var expTemplateUrl = resolveTemplateURL(controllerScript, 'viz-dashlet-exploded.html');
        var errorTemplateUrl = resolveTemplateURL(controllerScript, 'error-template.html');

        return {
            restrict: 'E',
            scope: {
                widgetid: '=',
                state: '=',
                displaytype: '=',
                displaymode: '=',
                presets: '='
            },
            template: '<div ng-include="resolveDynamicTemplate()"></div>',
            controller: function ($scope, $http, dashletcomssrv) {
                $scope.state.unwatchers = [];

                $scope.resolveDynamicTemplate = function () {
                    if ($scope.displaytype === 'aggregated') {
                        return aggTemplateUrl;
                    }
                    else {
                        if ($scope.displaytype === 'exploded') {
                            return expTemplateUrl;
                        } else {
                            return errorTemplateUrl;
                        }
                    }
                };

                $scope.selectTab = function (tabIndex) {
                    $scope.state.tabindex = tabIndex;
                };

                $scope.isTabActive = function (tabIndex) {
                    return tabIndex === $scope.state.tabindex;
                };

                $scope.messageBoxClick = function(){
                    $scope.$broadcast('clearmessages');
                };

                $scope.toggleBarchevronToConf = function () {
                    $scope.state.viewtoggle = !$scope.state.viewtoggle;
                }

                $scope.toggleBarchevronToViz = function () {
                    $scope.fireQueryDependingOnContext();
                    $scope.state.viewtoggle = !$scope.state.viewtoggle;
                }

                $scope.fireQueryDependingOnContext = function () {
                    //Not firing our own query if slave, just listening to data
                    //Also not firing if autorefresh is on
                    if (!$scope.state.config.slave && ($scope.state.config.autorefresh !== 'On')) {
                        $scope.fireQuery();
                    }
                }

                $scope.cleanupState = function(){
                    $scope.state.info.http.asynccheckpoint = false;
                    $scope.clearAsync();
                    $scope.$broadcast('cleanup-info');
                };

                // init
                $scope.isOngoingQuery = false;
                $scope.autorefreshInterval = undefined;

                $scope.fireQuery = function () {
                    //in case any async query already ongoing
                    //console.log('['+$scope.widgetid+']Firing query.');
                    try {
                        $scope.isOngoingQuery = true;
                        var srv = $scope.state.query.datasource.service;
                        if (!srv.params) {
                            srv.params = ""; // prevent "undefined" string from being concatenated
                        }

                        //Done out of the box via templace
                        //$scope.executeReplace(srv);

                        $scope.state.info.http.servicesent = 'url :' + JSON.stringify(srv.url + srv.params) + '; payload:' + JSON.stringify(srv.data);
                        $scope.executeHttp(srv.method, srv.url + srv.params, srv.data, $scope.dispatchSuccessResponse, srv, $scope.dispatchErrorResponse);
                    } catch (e) {
                        console.log('exception thrown while firing query: ' + e);
                    }
                };

                $scope.dispatchErrorResponse = function (response) {
                    if ($scope.state.query.type === 'Simple') {
                        $scope.state.info.http.rawserviceresponse = JSON.stringify(response);
                    }
                    if ($scope.state.query.type === 'Async') {
                        $scope.state.info.http.rawcallbackresponse = JSON.stringify(response);
                    }
                    $scope.$broadcast('errormessage', 'Query execution failed. Check service response for more details.');
                    $scope.clearAsync();
                    $scope.isOngoingQuery = false;
                };

                $scope.executeHttp = function (method, url, payload, successcallback, successTarget, errorcallback) {
                    if (method === 'Get') { $http.get(url).then(function (response) { successcallback(response, successTarget); }, function (response) { errorcallback(response); }); }
                    if (method === 'Post') { $http.post(url, payload).then(function (response) { successcallback(response, successTarget); }, function (response) { errorcallback(response); }); }
                };

                $scope.dispatchSuccessResponse = function (response, successTarget) {
                    try {
                        if ($scope.state.query.type === 'Simple') {
                            $scope.loadData(response, successTarget);
                        }
                        if ($scope.state.query.type === 'Async') {
                            $scope.state.info.http.asynccheckpoint = true;
                            var srv = $scope.state.query.datasource.service;
                            var scallback = $scope.state.query.datasource.callback;
                            //$scope.state.data.serviceraw = response;
                            if ($scope.state.info.showraw === 'On') {
                                $scope.state.info.http.rawserviceresponse = JSON.stringify(response);
                            }
                            if ($scope.state.query.datasource.service.postproc.save) {
                                $scope.state.data.state = runResponseProc(srv.postproc.save.function, null, response);
                            }

                            var input = $scope.executeReplace(scallback, $scope.state.data.placeholdersstate);

                            $scope.state.info.http.callbacksent = 'url :' + JSON.stringify(input.url) + '; payload:' + JSON.stringify(input.data);
                            var executionFunction = function () {
                                $scope.executeHttp(scallback.method, input.url, input.data, $scope.loadData, scallback, $scope.dispatchErrorResponse)
                            };
                            $scope.setAsyncInterval(executionFunction);
                        }
                    } catch (e) {
                        console.log(e);
                        $scope.clearAsync();
                        $scope.isOngoingQuery = false;
                    }
                };

                //TODO: this should be scoped inside viz-query (inputs) and triggered via events
                $scope.executeReplace = function (service, mergedplaceholders) {
                    var mergedstate;
                    if (mergedplaceholders) {
                        mergedstate = $scope.state.data.state.concat(mergedplaceholders);
                    } else {
                        mergedstate = $scope.state.data.state;
                    }
                    var datatosend = service.data;
                    var urltosend = service.url;
                    if (service.preproc.replace && service.preproc.replace.function) {
                        var replaced;
                        if (datatosend) {
                            try {
                                replaced = runRequestProc(service.preproc.replace.function, datatosend, mergedstate);
                                datatosend = JSON.parse(replaced);
                            } catch (e) {
                                console.log('An issue occured while replacing payload data: ' + e);
                            }
                        }
                        if (urltosend) {
                            try {
                                replaced = runRequestProc(service.preproc.replace.function, urltosend, mergedstate);
                                urltosend = replaced;
                            } catch (e) {
                                console.log('An issue occured while replacing url params: ' + e);
                            }
                        }
                    }

                    return {data: datatosend, url: urltosend};
                }

                $scope.setAsyncInterval = function (callback) {
                    $scope.clearAsync();

                    var duration = setIntervalAsyncDefault;
                    if ($scope.state.config.asyncrefreshduration) {
                        duration = $scope.state.config.asyncrefreshduration;
                    }

                    $scope.asyncInterval = setInterval(callback, duration);
                };

                $scope.clearAsync = function () {
                    if ($scope.asyncInterval) {
                        clearInterval($scope.asyncInterval);
                    }
                };

                $scope.loadData = function (response, proctarget) {
                    if ($scope.state.query.type === 'Simple') {
                        if ($scope.state.info.showraw === 'On') {
                            $scope.state.info.http.rawserviceresponse = JSON.stringify(response);
                        }
                        $scope.isOngoingQuery = false;
                    }
                    if ($scope.state.query.type === 'Async') {
                        if ($scope.asyncInterval) {
                            try {
                                // stream consumed
                                if (runResponseProc($scope.state.query.datasource.callback.postproc.asyncEnd.function, null, response)) {
                                    //console.log('consumed. Clearing Async and resetting query fire.')
                                    $scope.clearAsync();
                                    $scope.isOngoingQuery = false;
                                } else {
                                    //console.log('Stream incomplete -> ' + JSON.stringify(response));
                                }
                            } catch (e) {
                                console.log(e);
                                $scope.clearAsync();
                            }
                        }
                        if ($scope.state.info.showraw === 'On') {
                            $scope.state.info.http.rawcallbackresponse = JSON.stringify(response);
                        }
                    }
                    $scope.state.data.rawresponse = { dashdata: response };
                };

                $scope.state.unwatchers.push($scope.$watch('state.data.rawresponse', function (newValue) {
                    var proctarget = undefined;
                    if ($scope.state.query.type === 'Simple') {
                        proctarget = $scope.state.query.datasource.service;
                    }
                    if ($scope.state.query.type === 'Async') {
                        proctarget = $scope.state.query.datasource.callback;
                    }
                    if (proctarget && proctarget.postproc && newValue && newValue.dashdata) { // due to watch init
                        if (proctarget.postproc.transform.function && proctarget.postproc.transform.function.length > 0) {
                            $scope.state.data.transformed = { dashdata: runResponseProc(proctarget.postproc.transform.function, keyvalarrayToIndex(evalDynamic(proctarget.postproc.transform.args), 'key', 'value'), newValue.dashdata) };
                        } else {
                            console.log('Warning: a new raw value was read by widget with id : ' + $scope.widgetid + ' but no transform function was provided');
                        }
                    }
                }));

                $scope.clearAutorefreshInterval = function () {
                    if ($scope.autorefreshInterval) {
                        clearInterval($scope.autorefreshInterval);
                    }
                }

                $scope.state.unwatchers.push($scope.$watch('state.config.autorefresh', function (newValue) {
                    $scope.clearAutorefreshInterval();
                    if (newValue === 'On') {
                        $scope.setAutorefreshInterval();
                    }
                }));

                $scope.setAutorefreshInterval = function () {
                    var duration = setIntervalDefault;
                    if ($scope.state.config.autorefreshduration) {
                        duration = $scope.state.config.autorefreshduration;
                    }

                    $scope.autorefreshInterval = setInterval(function () {
                        if (!$scope.isOngoingQuery) {
                            try {
                                //console.log('$scope.isOngoingQuery=' + $scope.isOngoingQuery + "; Firing.");
                                $scope.fireQuery();
                            } catch (e) {
                                console.log('[Autorefresh] unable to refresh due to error: ' + e + "; Starting new query.");
                                // agressive
                                $scope.isOngoingQuery = false;
                            }
                        } else {
                            //console.log('$scope.isOngoingQuery=' + $scope.isOngoingQuery + "; Skipping interval.");
                        }
                    }, duration);
                }

                // info pane trigger
                $scope.$on('firequery', function () {
                    $scope.fireQuery();
                });

                // Paging

                // also initPaging() on viewtoggle (back to config)?
                $scope.$on('templateph-loaded', function () {
                    if ($scope.state.query.controls
                        && $scope.state.query.controls.template
                        && $scope.state.query.paged.ispaged) {
                        $scope.initPaging();
                    }
                });

                $scope.$on('firenext', function () {
                    $scope.nextPaging();
                });

                $scope.$on('fireprevious', function () {
                    $scope.previousPaging();
                });

                $scope.$on('template-updated', function () {
                    $scope.fireQuery();
                });

                $scope.initPaging = function () {
                    var paged = $scope.state.query.paged;
                    if (paged && paged.offsets && paged.offsets.first) {
                        paged.offsets.first.state = runValueFunction(paged.offsets.first.start);
                        if (paged.offsets.second) {
                            paged.offsets.second.state = runValueFunction(paged.offsets.second.start);
                        }
                    }
                    $scope.$broadcast('update-template-nofire');
                }

                $scope.nextPaging = function () {
                    var paged = $scope.state.query.paged;
                    paged.offsets.first.state = runValueFunction(paged.offsets.first.next, paged.offsets.first.state);
                    paged.offsets.second.state = runValueFunction(paged.offsets.second.next, paged.offsets.second.state);
                    $scope.$broadcast('update-template');
                }

                $scope.previousPaging = function () {
                    var paged = $scope.state.query.paged;
                    paged.offsets.first.state = runValueFunction(paged.offsets.first.previous, paged.offsets.first.state);
                    paged.offsets.second.state = runValueFunction(paged.offsets.second.previous, paged.offsets.second.state);
                    $scope.$broadcast('update-template');
                };

                $scope.terminate = function () {
                    console.log('[' + $scope.widgetid + '] terminating...');
                    dashletcomssrv.unregisterWidget($scope.widgetid);
                    $scope.clearAsync();
                    $scope.clearAutorefreshInterval();
                    $scope.state.config.autorefresh = 'Off';
                    $scope.state.data = {};
                    $scope.state = null;
                    console.log('[' + $scope.widgetid + '] termination complete.');
                };

                $scope.unwatchAll = function () {
                    $.each($scope.state.unwatchers, function (idx, unwatcher) {
                        unwatcher();
                    });
                };

                if (!$scope.state.viewtoggle) {
                    $scope.$on('dashletinput-initialized', function () {
                        $scope.fireQueryDependingOnContext();
                    });
                }

                $scope.$on('$destroy', function () {
                    $scope.terminate();
                });
            }
        };
    });