import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, DollarSign, Activity, Calendar } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear } from "date-fns";
import { es } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MetricCardProps {
  title: string;
  value: string;
  change?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
}

const MetricCard = ({ title, value, change, icon, trend = "neutral" }: MetricCardProps) => {
  const trendColors = {
    up: "text-success",
    down: "text-destructive",
    neutral: "text-muted-foreground",
  };

  return (
    <Card className="shadow-md hover:shadow-financial transition-all duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold financial-number">{value}</div>
        {change && (
          <p className={`text-xs ${trendColors[trend]} flex items-center gap-1 mt-1`}>
            {trend === "up" && <TrendingUp className="w-3 h-3" />}
            {trend === "down" && <TrendingDown className="w-3 h-3" />}
            {change}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export const Dashboard = () => {
  const [period, setPeriod] = useState<string>("current-month");

  const getDateRange = () => {
    const now = new Date();
    switch (period) {
      case "current-month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "last-month":
        return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
      case "current-year":
        return { start: startOfYear(now), end: now };
      case "last-3-months":
        return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const { data: metrics, isLoading } = useQuery({
    queryKey: ["dashboard-metrics", period],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("No user");

      const { start, end } = getDateRange();

      const { data: transactions, error } = await supabase
        .from("transactions_unified")
        .select("*")
        .eq("user_id", user.user.id)
        .gte("fecha", format(start, "yyyy-MM-dd"))
        .lte("fecha", format(end, "yyyy-MM-dd"));

      if (error) throw error;

      const income = transactions
        ?.filter((t) => t.tipo === "in")
        .reduce((sum, t) => sum + Number(t.monto_cop), 0) || 0;

      const expenses = transactions
        ?.filter((t) => t.tipo === "out")
        .reduce((sum, t) => sum + Number(t.monto_cop), 0) || 0;

      const netFlow = income - expenses;

      // Calculate by category
      const byCategory = transactions?.reduce((acc, t) => {
        const cat = t.categoria || "Sin categoría";
        if (!acc[cat]) acc[cat] = 0;
        acc[cat] += Number(t.monto_cop);
        return acc;
      }, {} as Record<string, number>);

      return {
        income,
        expenses,
        netFlow,
        totalTransactions: transactions?.length || 0,
        byCategory,
      };
    },
  });

  const getPeriodLabel = () => {
    switch (period) {
      case "current-month": return "Mes actual";
      case "last-month": return "Mes pasado";
      case "current-year": return "Año actual";
      case "last-3-months": return "Últimos 3 meses";
      default: return "Período";
    }
  };

  const formatCOP = (amount: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="h-20" />
            <CardContent className="h-16" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Resumen Financiero</h2>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[200px]">
            <Calendar className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Seleccionar período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current-month">Mes actual</SelectItem>
            <SelectItem value="last-month">Mes pasado</SelectItem>
            <SelectItem value="last-3-months">Últimos 3 meses</SelectItem>
            <SelectItem value="current-year">Año actual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Ingresos"
          value={formatCOP(metrics?.income || 0)}
          icon={<TrendingUp className="h-4 w-4" />}
          trend="up"
          change={getPeriodLabel()}
        />
        <MetricCard
          title="Egresos"
          value={formatCOP(metrics?.expenses || 0)}
          icon={<TrendingDown className="h-4 w-4" />}
          trend="down"
          change={getPeriodLabel()}
        />
        <MetricCard
          title="Flujo Neto"
          value={formatCOP(metrics?.netFlow || 0)}
          icon={<DollarSign className="h-4 w-4" />}
          trend={metrics?.netFlow && metrics.netFlow > 0 ? "up" : "down"}
          change={getPeriodLabel()}
        />
        <MetricCard
          title="Transacciones"
          value={String(metrics?.totalTransactions || 0)}
          icon={<Activity className="h-4 w-4" />}
          change={getPeriodLabel()}
        />
      </div>
    </div>
  );
};
