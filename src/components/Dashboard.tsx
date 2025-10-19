import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Activity } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

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
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("No user");

      // Get current month transactions
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: transactions, error } = await supabase
        .from("transactions_unified")
        .select("*")
        .eq("user_id", user.user.id)
        .gte("fecha", format(startOfMonth, "yyyy-MM-dd"));

      if (error) throw error;

      const income = transactions
        ?.filter((t) => t.tipo === "in")
        .reduce((sum, t) => sum + Number(t.monto_cop), 0) || 0;

      const expenses = transactions
        ?.filter((t) => t.tipo === "out")
        .reduce((sum, t) => sum + Number(t.monto_cop), 0) || 0;

      const netFlow = income - expenses;

      return {
        income,
        expenses,
        netFlow,
        totalTransactions: transactions?.length || 0,
      };
    },
  });

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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Ingresos del Mes"
        value={formatCOP(metrics?.income || 0)}
        icon={<TrendingUp className="h-4 w-4" />}
        trend="up"
        change="Mes actual"
      />
      <MetricCard
        title="Egresos del Mes"
        value={formatCOP(metrics?.expenses || 0)}
        icon={<TrendingDown className="h-4 w-4" />}
        trend="down"
        change="Mes actual"
      />
      <MetricCard
        title="Flujo Neto"
        value={formatCOP(metrics?.netFlow || 0)}
        icon={<DollarSign className="h-4 w-4" />}
        trend={metrics?.netFlow && metrics.netFlow > 0 ? "up" : "down"}
      />
      <MetricCard
        title="Transacciones"
        value={String(metrics?.totalTransactions || 0)}
        icon={<Activity className="h-4 w-4" />}
        change="Mes actual"
      />
    </div>
  );
};
