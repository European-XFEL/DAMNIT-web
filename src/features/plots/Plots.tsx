import React from "react";
import { connect } from "react-redux";
import ReactEcharts from "echarts-for-react";

const Plots = ({ option }) => {
  return (
    <div>
      <ReactEcharts option={option} />
    </div>
  );
};

const mapStateToProps = ({ table, plots }) => {
  const plot = plots.data[plots.currentPlot];
  return {
    option: {
      xAxis: { data: plot.runs, type: "category" },
      yAxis: { scale: true },
      series: {
        type: plot.type,
        data: plot.runs.map((run) => table.data[run][plot.variable]),
      },
    },
  };
};

export default connect(mapStateToProps)(Plots);
