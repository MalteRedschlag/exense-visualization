angular.module('viz-dashlet', ['nvd3', 'ui.bootstrap'])

.directive('viz-dashlet', function(){
    return {
        restric: 'AECM',
        controller: function () {
          console.log('hello world.');
          alert('sup');
      }  
    };
});


function DefaultChartOptions(){
    return {
        chart: {
            type: 'lineChart',
            height: 250,
            width: 500,
            margin : {
                top: 20,
                right: 20,
                bottom: 40,
                left: 55
            },
            x: function(d){ return d.x; },
            y: function(d){ return d.y; },
            useInteractiveGuideline: true,
            dispatch: {
                stateChange: function(e){ console.log("stateChange"); },
                changeState: function(e){ console.log("changeState"); },
                tooltipShow: function(e){ console.log("tooltipShow"); },
                tooltipHide: function(e){ console.log("tooltipHide"); }
            },
            xAxis: {
                axisLabel: 'Time (ms)'
            },
            yAxis: {
                axisLabel: 'Voltage (v)',
                tickFormat: function(d){
                    return d3.format('.02f')(d);
                },
                axisLabelDistance: -10
            },
            callback: function(chart){
                //console.log("!!! lineChart callback !!!");
            }
            }
        };
};