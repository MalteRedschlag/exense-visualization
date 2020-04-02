registerScript();

function Filter(type, key) {
    return {
        type: type,
        key: key
    }
}

function TextFilter(key, value, isRegex) {
    var filter = new Filter('text', key);
    filter.value = value;
    filter.regex = isRegex;
    return filter;
};

function NumericalFilter(key, minValue, maxValue) {
    var filter = new Filter('numerical', key);
    filter.minValue = minValue;
    filter.maxValue = maxValue;
    return filter;
};

function DateFilter(key, minDate, maxDate) {
    var filter = new Filter('date', key);
    filter.minDate = minDate;
    filter.maxDate = maxDate;
    return filter;
};

function Selector(textFilters, numericalFilters) {
    return {
        textFilters: textFilters,
        numericalFilters: numericalFilters
    };
}

function ServiceParams(cpu, granularity, groupby, partition, sessionId, timeout, nextFactor, timeField, timeFormat, valueField) {
    return {
        "aggregateService.cpu": cpu,
        "aggregateService.granularity": granularity,
        "aggregateService.groupby": groupby,
        "aggregateService.partition": partition,
        "aggregateService.sessionId": sessionId,
        "aggregateService.timeout": timeout,
        "measurementService.nextFactor": nextFactor,
        "aggregateService.timeField": timeField,
        "aggregateService.timeFormat": timeFormat,
        "aggregateService.valueField": valueField
    };
}

function RTMPayload(selectorCollection, serviceParams) {
    return {
        selectors1: selectorCollection,
        serviceParams: serviceParams
    };
}

function DefaultTextFilter() {
    return new TextFilter('eId', '', 'Off');
};

function DefaultNumericalFilter() {
    return new NumericalFilter('value', 0, 1);
};

function DefaultDateFilter() {
    return new DateFilter('begin', new Date(new Date().getTime() - 3600000), new Date());
};

function DefaultSelector() {
    return {
        textFilters: [],
        numericalFilters: []
    };
}

function EidSelector(eId) {
    return {
        textFilters: [new TextFilter('eId', eId, false)],
        numericalFilters: []
    };
}

function DefaultServiceParams() {
    return new ServiceParams(
    /* "aggregateService.cpu": */ "1",
    /* "aggregateService.granularity": */ "auto",
    /* "aggregateService.groupby": */ "name",
    /* "aggregateService.partition": */ "8",
    /* "aggregateService.sessionId": */ "defaultSid",
    /* "aggregateService.timeout": */ "600",
    /* "measurementService.nextFactor": */ "__FACTOR__",
    /*"aggregateService.timeField": */ "begin",
    /*"aggregateService.timeFormat": */ "long",
    /*"aggregateService.valueField": */ "value"
    );
}

function DefaultRTMPayload() {
    return new RTMPayload([new DefaultSelector()], new DefaultServiceParams());
}

function StepRTMPayload() {
    return new RTMPayload([new EidSelector()], new DefaultServiceParams());
}

function RTMAggregatesMasterQuery() {
    var query = new DefaultAsyncQuery();
    query.controls = new DefaultControls();
    query.paged = new DefaultPaging();
    query.controltype = 'RTM';
    query.controls.querytype = 'aggregates';

    var tFunc = function (response, args) {

        console.log('master!')

        var metric = args.metric;
        var metricSplit = args.metric.split(';');
        var retData = [], series = {};
        var payload = response.data.payload.stream.streamData;
        var payloadKeys = Object.keys(payload);
        for (i = 0; i < payloadKeys.length; i++) {
            var serieskeys = Object.keys(payload[payloadKeys[i]])
            for (j = 0; j < serieskeys.length; j++) {
                $.each(metricSplit, function (idx, m) {
                    if (m && payload[payloadKeys[i]][serieskeys[j]][m]) {
                        retData.push({ x: payloadKeys[i], y: payload[payloadKeys[i]][serieskeys[j]][m], z: serieskeys[j] });
                    }
                });
            }
        }
        return retData;
    };
    var transform = tFunc.toString();

    query.type = 'Async';
    query.datasource = {
        service: new Service(//service
            "/rtm/rest/aggregate/get", "Post",
            "",//templated
            new Preproc("function(requestFragment, workData){var newRequestFragment = requestFragment;for(i=0;i<workData.length;i++){newRequestFragment = newRequestFragment.replace(workData[i].key, workData[i].value);}return newRequestFragment;}"),
            new Postproc("", "", [], "function(response){if(!response.data.payload){console.log('No payload ->' + JSON.stringify(response)); return null;}return [{ placeholder : '__streamedSessionId__', value : response.data.payload.streamedSessionId, isDynamic : false }];}", "")),
        callback: new Service(//callback
            "/rtm/rest/aggregate/refresh", "Post",
            "{\"streamedSessionId\": \"__streamedSessionId__\"}",
            new Preproc("function(requestFragment, workData){var newRequestFragment = requestFragment;for(i=0;i<workData.length;i++){newRequestFragment = newRequestFragment.replace(workData[i].placeholder, workData[i].value);}return newRequestFragment;}"),
            new Postproc("function(response){return response.data.payload.stream.complete;}", transform, [{ "key": "metric", "value": "cnt", "isDynamic": false }], {}, ""))
    };

    query.controls.rtmmodel = new DefaultRTMPayload();
    return query;
}

function RTMAggregatesSlaveQuery() {
    var query = new DefaultAsyncQuery();
    query.controls = new DefaultControls();
    query.paged = new DefaultPaging();
    query.controltype = 'RTM';
    query.controls.querytype = 'aggregates';

    var tFunc = function (response, args) {

        console.log('slave!')
        var metric = args.metric;
        var metricSplit = args.metric.split(';');
        var retData = [], series = {};
        var payload = response.data.payload.stream.streamData;

        var payloadKeys = Object.keys(payload);
        $.each(payloadKeys, function (idx1, time) {

            var serieskeys = Object.keys(payload[time]);
            $.each(serieskeys, function (idx2, group) {

                $.each(metricSplit, function (idx3, m) {
                    if (m && payload[time][group][m]) {
                        retData.push({ 'x': time, 'y': payload[time][group][m], 'z': group, 'm': m });
                    }
                });
            });
        });

        return retData;
    };
    var transform = tFunc.toString();


    query.type = 'Async';
    query.datasource = {
        service: new Service(//service
            "/rtm/rest/aggregate/get", "Post",
            "",//templated
            new Preproc("function(requestFragment, workData){var newRequestFragment = requestFragment;for(i=0;i<workData.length;i++){newRequestFragment = newRequestFragment.replace(workData[i].key, workData[i].value);}return newRequestFragment;}"),
            new Postproc("", "", [], "function(response){if(!response.data.payload){console.log('No payload ->' + JSON.stringify(response)); return null;}return [{ placeholder : '__streamedSessionId__', value : response.data.payload.streamedSessionId, isDynamic : false }];}", "")),
        callback: new Service(//callback
            "/rtm/rest/aggregate/refresh", "Post",
            "{\"streamedSessionId\": \"__streamedSessionId__\"}",
            new Preproc("function(requestFragment, workData){var newRequestFragment = requestFragment;for(i=0;i<workData.length;i++){newRequestFragment = newRequestFragment.replace(workData[i].placeholder, workData[i].value);}return newRequestFragment;}"),
            new Postproc("function(response){return response.data.payload.stream.complete;}", transform, [{ "key": "metric", "value": "cnt", "isDynamic": false }], {}, ""))
    };

    query.controls.rtmmodel = new DefaultRTMPayload();
    return query;
}

function RTMRawValuesBaseQuery(timeField, valueField, groupby) {
    return new SimpleQuery(
        "Raw", new Service(
            "/rtm/rest/measurement/find", "Post",
            "",
            new Preproc("function(requestFragment, workData){var newRequestFragment = requestFragment;for(i=0;i<workData.length;i++){newRequestFragment = newRequestFragment.replace(workData[i].key, workData[i].value);}return newRequestFragment;}"),
            new Postproc("", "function (response, args) {\r\n    var x = '" + timeField + "', y = '" + valueField + "', z = '" + groupby + "';\r\n    var retData = [], index = {};\r\n    var payload = response.data.payload;\r\n    for (var i = 0; i < payload.length; i++) {\r\n        retData.push({\r\n            x: payload[i][x],\r\n            y: payload[i][y],\r\n            z: payload[i][z]\r\n        });\r\n    }\r\n    return retData;\r\n}",
                [], {}, "")
        )
    );
};

function RTMRawValuesMasterQuery() {
    var query = new TemplatedQuery(
        "Plain",
        new RTMRawValuesBaseQuery("begin", "value", "name"),
        new Paging("On", new Offset("__FACTOR__", "return 0;", "return value + 1;", "if(value > 0){return value - 1;} else{return 0;}"), null),
        new Controls(
            new DefaultTemplate(),
            "",
            [new Placeholder("__FACTOR__", "100", false)]
        )
    );

    query.controltype = 'RTM';
    query.controls.querytype = 'rawvalues';
    query.controls.rtmmodel = new DefaultRTMPayload();
    return query;
}

function RTMRawValuesSlaveQuery() {
    var query = new TemplatedQuery(
        "Plain",
        new RTMRawValuesBaseQuery("begin", "value", "name"),
        new DefaultPaging(),
        new Controls(
            new DefaultTemplate(),
            "",
            [new Placeholder("__FACTOR__", "100", false)]
        )
    );

    query.controltype = 'RTM';
    query.controls.querytype = 'rawvalues';
    query.controls.rtmmodel = new DefaultRTMPayload();
    return query;
}

function RTMMasterState() {
    return new DashletState(
        'Chart', true, 0,
        new DashletData({}, [], null),
        new DefaultChartOptions(),
        new Config('Fire', 'Off', true, false, 'unnecessaryAsMaster'),
        //(toggleaction, autorefresh, master, slave, target, autorefreshduration, asyncrefreshduration, incremental, incmaxdots, transposetable)
        new RTMAggregatesMasterQuery(),
        new DefaultGuiClosed(),
        new DefaultInfo()
    );
};

function RTMSlaveState(RTMmasterId) {
    var slaveConfig = new Config('Fire', 'Off', false, true, 'state.data.rawresponse', null, null, null, null, 'On');
    slaveConfig.currentmaster = {
        oid: RTMmasterId,
        title: 'Chart'
    };

    return new DashletState(
        'Table', true, 0,
        new DefaultDashletData(),
        new ChartOptions('dualTable', false, false,
            'function (d) {\r\n    var value;\r\n    if ((typeof d) === \"string\") {\r\n        value = parseInt(d);\r\n    } else {\r\n        value = d;\r\n    }\r\n\r\n    return d3.time.format(\"%H:%M:%S\")(new Date(value));\r\n}',
            'function (d) { return d.toFixed(1); }',
            null,
            null
        ),
        slaveConfig,
        new RTMAggregatesSlaveQuery(),
        new DefaultGuiClosed(),
        new DefaultInfo()
    );
};

function RTMMasterWidget(RTMmasterId) {
    return new Widget(
        RTMmasterId,
        new DefaultWidgetState(),
        new RTMMasterState()
    );
};

function RTMSlaveWidget(RTMmasterId) {
    return new Widget(
        "RTM-Slave-" + getUniqueId(),
        new DefaultWidgetState(),
        new RTMSlaveState(RTMmasterId)
    );
};

function RTMDashboardState() {
    var RTMmasterId = "RTM-Master-" + getUniqueId();

    return new DashboardState(
        new DefaultGlobalSettings(),
        [new RTMMasterWidget(RTMmasterId), new RTMSlaveWidget(RTMmasterId)],
        'RTM Dashboard',
        'aggregated',
        new DefaultDashboardGui()
    );
};

function RTMDashboard() {
    return new Dashboard(
        getUniqueId(),
        new RTMDashboardState(),
        'rtm'
    );
};

function RTMserialize(guiPayload) {
    if (!guiPayload) {
        throw new Error('guiPayload is null or undefined');
    }

    var copy = JSON.parse(angular.toJson(guiPayload));

    $.each(copy.selectors1, function (selIdx, selector) {

        var newNumericals = [];
        // Convert date filters into numerical filters
        $.each(selector.numericalFilters, function (filIdx, filter) {
            if (filter.type === 'date') {
                newNumericals.push(
                    new NumericalFilter(
                        filter.key,
                        Date.parse(filter.minDate),
                        Date.parse(filter.maxDate)
                    )
                );
            } else {
                newNumericals.push(filter);
            }
        });

        copy.selectors1[selIdx].numericalFilters = newNumericals;
    });

    $.each(copy.selectors1, function (selIdx, selector) {
        // Remove type info (unknown to backend)
        $.each(selector.textFilters, function (filIdx, filter) {
            filter.type = undefined;

            if (filter.regex === 'On') {
                filter.regex = true;
            } else {
                filter.regex = false;
            }
        });

        $.each(selector.numericalFilters, function (filIdx, filter) {
            filter.type = undefined;
        });

    });

    return angular.toJson(copy);
}


angular.module('rtm-controls', ['angularjs-dropdown-multiselect'])

    .directive('rtmControls', function () {

        var controllerScript = 'rtm-controls.js';
        var horizontal = resolveTemplateURL(controllerScript, 'rtm-controls-horizontal.html');
        var vertical = resolveTemplateURL(controllerScript, 'rtm-controls-vertical.html');

        return {
            restrict: 'E',
            scope: {
                payload: '=',
                query: '=',
                orientation: '=?',
                slavestate: '=',
                masterstate: '='
            },

            template: '<div ng-include="resolveDynamicTemplate()"></div>',
            controller: function ($scope) {

                $scope.unwatchers = [];

                $scope.forceReloadQuery = function () {
                    // force reload entire query for data update
                    forceRedraw($scope);
                    // need to force an angular cycle for the model change to be taken in account
                    setTimeout(function () { $scope.$emit('broadcastQueryFire'); }, 100);

                };

                $scope.forceReloadTransform = function () {
                    // force transform reload for metric/visualization update
                    if ($scope.masterstate) {
                        $scope.masterstate.data.rawresponse = JSON.parse(angular.toJson($scope.masterstate.data.rawresponse));
                    }
                };

                $scope.$on('forceReloadTransform', function (event, arg) {
                    $scope.forceReloadTransform();
                });

                $scope.$on('forceReloadQuery', function (event, arg) {
                    $scope.forceReloadQuery();
                });

                $scope.init = function () {

                    if ($scope.masterstate) {

                        $scope.unwatchers.push(
                            $scope.$watch('masterstate.query.controls.querytype', function (newValue, oldvalue) {

                                //preserve model in the event of a service switch (1)
                                var savedControl = $scope.masterstate.query.controls.rtmmodel;
                                var savedPayload = $scope.masterstate.query.controls.template.templatedPayload;

                                if ($scope.masterstate.query
                                    && $scope.masterstate.query.controls
                                    && $scope.masterstate.query.controls.querytype
                                    && oldvalue !== newValue) {

                                    if (newValue === 'aggregates') {
                                        $scope.masterstate.query = new RTMAggregatesMasterQuery();
                                        $scope.slavestate.query = new RTMAggregatesSlaveQuery();
                                    } else {
                                        if (newValue === 'rawvalues') {
                                            $scope.masterstate.query = new RTMRawValuesMasterQuery();
                                            $scope.slavestate.query = new RTMRawValuesSlaveQuery();
                                        } else {
                                            console.log("unsupported RTM service: " + newValue);
                                        }
                                    }

                                    //preserve model in the event of a service switch (2)
                                    if (savedControl) {
                                        $scope.masterstate.query.controls.rtmmodel = savedControl;
                                    }

                                    if (savedPayload) {
                                        $scope.masterstate.query.controls.template.templatedPayload = savedPayload;
                                    }

                                    $scope.forceReloadQuery();
                                }
                            })
                        );

                        $scope.unwatchers.push(
                            $scope.$watch('masterstate.query.controls.rtmmodel', function (newValue, oldValue) {
                                //if (angular.toJson(newValue) !== angular.toJson(oldValue)) {
                                var newPayload = RTMserialize(newValue);

                                if (newPayload) {
                                    $scope.masterstate.query.controls.template.templatedPayload = newPayload;
                                }
                                //}
                            }, true) // deep watching changes in the RTM models
                        );
                    }
                }

                /* Dynamic template impl*/
                $scope.resolveDynamicTemplate = function () {
                    if ($scope.orientation === 'horizontal') {
                        return horizontal;
                    }
                    else {
                        return vertical;
                    }
                };

                $scope.addSelector = function () {
                    $scope.payload.selectors1.push(new DefaultSelector());
                };

                $scope.clearAll = function () {
                    $scope.payload.selectors1.length = 0;
                };

                $scope.removeSelector = function (idx) {
                    $scope.payload.selectors1.splice(idx, 1);
                };

                // Very temporary intg with step (need to implement pre-tmplt update from controls)
                $scope.$on('apply-global-setting', function (event, arg) {
                    var split = arg.value.split(',');
                    var type = split[0];
                    var key = split[1];
                    var value1 = split[2];
                    var value2 = split[3];

                    if (type === 'text') {
                        $scope.payload.selectors1[0].textFilters.push(new TextFilter(key, value1, value2));
                    }
                });

                $scope.init();

            }
        };
    })
    .directive('rtmSelector', function () {
        return {
            restrict: 'E',
            scope: {
                textfilters: '=',
                numericalfilters: '=',
            },

            templateUrl: resolveTemplateURL('rtm-controls.js', 'rtm-selector.html'),
            controller: function ($scope) {
                //console.log(angular.toJson($scope.textfilters));
                //console.log(angular.toJson($scope.numericalfilters));

                $scope.addTextFilter = function () {
                    $scope.textfilters.push(new DefaultTextFilter());
                };

                $scope.addNumericalFilter = function () {
                    console.log($scope.numericalfilters)
                    $scope.numericalfilters.push(new DefaultNumericalFilter());
                    console.log($scope.numericalfilters)
                };

                $scope.addDateFilter = function () {
                    $scope.numericalfilters.push(new DefaultDateFilter());
                };


                $scope.removeTextfilter = function (idx) {
                    $scope.textfilters.splice(idx, 1);
                };

                $scope.removeNumericalfilter = function (idx) {
                    $scope.numericalfilters.splice(idx, 1);
                };
            }
        };
    })
    .directive('rtmServiceParams', function () {
        return {
            restrict: 'E',
            scope: {
                params: '=',
                query: '=',
                masterstate: '=',
                slavestate: '='
            },

            templateUrl: resolveTemplateURL('rtm-controls.js', 'rtm-service-params.html'),
            controller: function ($scope) {

                $scope.setParam = function (pName, newGran) {
                    $scope.params[pName] = newGran;
                    $scope.forceReloadQuery();
                };

                $scope.setChartMetric = function (metric) {
                    $scope.query.datasource.callback.postproc.transform.args[0].value = metric;
                    $scope.forceReloadTransform();
                };

                $scope.forceReloadQuery = function () {
                    $scope.$emit('forceReloadQuery');
                };

                $scope.forceReloadTransform = function () {
                    $scope.$emit('forceReloadTransform');
                };

                $scope.updateTableMetrics = function (metricList) {
                    if (metricList && metricList.length > 0
                        && $scope.slavestate && $scope.slavestate.query && $scope.slavestate.query.datasource && $scope.slavestate.query.datasource.callback
                        && $scope.slavestate.query.datasource.callback.postproc && $scope.slavestate.query.datasource.callback.postproc.transform
                        && $scope.slavestate.query.datasource.callback.postproc.transform.args && $scope.slavestate.query.datasource.callback.postproc.transform.args[0]
                        && $scope.slavestate.query.datasource.callback.postproc.transform.args[0].value) {
                        $scope.slavestate.query.datasource.callback.postproc.transform.args[0].value = metricList;
                    }
                };


                $scope.$watch('query.controls.querytype', function (newValue) {
                    if ($scope.masterstate) {
                        newValue === 'rawvalues'
                            ? $scope.masterstate.options.chart.type = 'scatterChart'
                            : $scope.masterstate.options.chart.type = 'lineChart';
                    }
                });

                $scope.asList = function (selection) {
                    var list = "";
                    $.each(selection, function (idx, value) {
                        console.log(value);
                        if (value) {
                            list += value.id + ";";
                        }
                    });
                    return list;
                };

                $scope.performMetricUpdate = function (newValue) {
                    $scope.updateTableMetrics($scope.asList(newValue));
                    $scope.forceReloadTransform();
                };

                $scope.$watchCollection('selectedAggMetrics', function (newValue) {
                    $scope.performMetricUpdate(newValue);
                });

                $scope.$watchCollection('selectedRawMetrics', function (newValue) {
                    $scope.performMetricUpdate(newValue);
                });

                $scope.getMetricsList = function (payload) {
                    var metricsList = [];
                    var retData = [];
                    //var excludes = this.getExcludeList();
                    _.each(payload, function (model) {
                        for (var prop in model) {
                            if (metricsList.indexOf(prop) < 0) {
                                metricsList.push(prop);
                            }
                        }
                    });

                    _.each(metricsList, function (metric) {
                        retData.push({
                            "label": metric,
                            "id": metric
                        })
                    });

                    return retData;
                };

                $scope.$watch('masterstate.data.rawresponse', function (newValue) {
                    if ($scope.query) {
                        if ($scope.query.controls.querytype === 'rawvalues') {
                            if (newValue && newValue.dashdata && newValue.dashdata.data && newValue.dashdata.data.payload) {
                                $scope.rawmetrics = $scope.getMetricsList(newValue.dashdata.data.payload);
                            }
                        }
                    }
                });

                /* TODO: get dynamically from RTM conf */
                $scope.aggregatemetrics = [{
                    "label": "count",
                    "id": "cnt"
                }, {
                    "label": "average",
                    "id": "avg"
                }, {
                    "label": "min",
                    "id": "min"
                }, {
                    "label": "max",
                    "id": "max"
                }, {
                    "label": "median",
                    "id": "50th pcl"
                }, {
                    "label": "count / sec",
                    "id": "tps"
                }, {
                    "label": "count / min",
                    "id": "tpm"
                }, {
                    "label": "80th pcl",
                    "id": "80th pcl"
                }, {
                    "label": "90th pcl",
                    "id": "90th pcl"
                }, {
                    "label": "99th pcl",
                    "id": "99th pcl"
                }];


                $scope.rawmetrics = [{
                    "label": "begin",
                    "id": "begin"
                }, {
                    "label": "eId",
                    "id": "eId"
                }, {
                    "label": "value",
                    "id": "value"
                }];

                $scope.selectedAggMetrics = [];
                $scope.selectedRawMetrics = [];

                $scope.metricSearchSettings = {
                    scrollableHeight: '200px',
                    scrollable: true,
                    enableSearch: true
                };
                $scope.tabIndex = [0, 0, 0];

                $scope.selectTab = function (instance, index) {
                    if (instance > 0) {
                        while ($scope.tabIndex.length < instance) {
                            $scope.tabIndex.push(0);
                        }
                    }
                    $scope.tabIndex[instance] = index;
                };

                $scope.isTabActive = function (instance, index) {
                    if ($scope.tabIndex.length > instance && ($scope.tabIndex[instance] == index)) {
                        return true;
                    } else {
                        return false;
                    }

                };
            }
        };
    })
    .directive('rtmTextFilter', function () {
        return {
            restrict: 'E',
            scope: {
                key: '=',
                value: '=',
                regex: '='
            },

            templateUrl: resolveTemplateURL('rtm-controls.js', 'rtm-text-filter.html'),
            controller: function ($scope) {
                $scope.setKey = function (key) {
                    $scope.key = key;
                };
            }
        };
    })
    .directive('rtmNumericalFilter', function () {
        return {
            restrict: 'E',
            scope: {
                key: '=',
                minvalue: '=',
                maxvalue: '='
            },

            templateUrl: resolveTemplateURL('rtm-controls.js', 'rtm-numerical-filter.html'),
            controller: function ($scope) {

                $scope.setKey = function (key) {
                    $scope.key = key;
                };
            }
        };
    })
    .directive('rtmDateFilter', function () {
        return {
            restrict: 'E',
            scope: {
                key: '=',
                mindate: '=',
                maxdate: '='
            },

            templateUrl: resolveTemplateURL('rtm-controls.js', 'rtm-date-filter.html'),
            controller: function ($scope) {

                $scope.setKey = function (key) {
                    $scope.key = key;
                };
            }
        };
    })