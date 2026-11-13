"use client";

import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

/** "2026-11-02" es una fecha de calendario: se lee en hora local, no como medianoche UTC (saldría el día anterior). */
function etiqueta(fecha: string) {
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/** Visitas registradas por semana (lunes a domingo); la actual en blanco. */
export function GraficaVisitas({ semanas }: { semanas: { inicio: string; visitas: number; ventas: number }[] }) {
  const actual = semanas.length - 1;
  const datos: ChartData<"bar"> = {
    labels: semanas.map((s, i) => (i === actual ? "Esta semana" : etiqueta(s.inicio))),
    datasets: [
      {
        label: "Visitas",
        data: semanas.map((s) => s.visitas),
        // Diseño aprobado: semanas pasadas en morado oscuro, la actual en lila claro.
        backgroundColor: semanas.map((_, i) => (i === actual ? "#A78BFA" : "#5B3AA8")),
        hoverBackgroundColor: semanas.map((_, i) => (i === actual ? "#C4B5FD" : "#7C3AED")),
        borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 2, bottomRight: 2 },
        borderSkipped: false,
        maxBarThickness: 40,
        categoryPercentage: 0.7,
      },
    ],
  };
  const opciones: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300, easing: "easeOutQuart" },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: (c) => (c.index === actual ? "#FFFFFF" : "#A1A1B5"), font: { size: 11 } },
      },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: "#1F1A30" },
        ticks: { color: "#A1A1B5", font: { size: 11 }, precision: 0, maxTicksLimit: 5 },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#120E1F",
        borderColor: "#7C3AED",
        borderWidth: 1,
        titleColor: "#FFFFFF",
        bodyColor: "#E9D5FF",
        padding: 10,
        callbacks: {
          title: (items) => `Semana del ${items[0]?.label ?? ""}`,
          label: (ctx) => {
            const s = semanas[ctx.dataIndex];
            return ` ${s.visitas} ${s.visitas === 1 ? "visita" : "visitas"} · $${Math.round(s.ventas).toLocaleString("es-MX")}`;
          },
        },
      },
    },
  };
  return (
    <div className="h-56" role="img" aria-label="Visitas por semana, últimas 8 semanas">
      <Bar data={datos} options={opciones} />
    </div>
  );
}
