import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";

const CATEGORIAS = [
  "FULFILLMENT",
  "REV_DROPI_COD",
  "WITHDRAWALS",
  "ADS_FACEBOOK",
  "SOFTWARE_TOOLS",
  "INTERNAL_TRANSFER",
  "INVENTORY",
  "OPERATIONAL",
  "OTHER",
];

export const CategoryRules = () => {
  const [keyword, setKeyword] = useState("");
  const [categoria, setCategoria] = useState("");
  const [contrapartida, setContrapartida] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rules = [] } = useQuery({
    queryKey: ["categorization-rules"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("No user");

      const { data, error } = await supabase
        .from("categorization_rules")
        .select("*")
        .eq("user_id", user.user.id)
        .order("priority", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const addRuleMutation = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("No user");

      const { error } = await supabase.from("categorization_rules").insert({
        user_id: user.user.id,
        keyword,
        categoria,
        contrapartida: contrapartida || undefined,
        priority: 0,
        active: true,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categorization-rules"] });
      setKeyword("");
      setCategoria("");
      setContrapartida("");
      toast({ title: "Regla creada exitosamente" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al crear regla",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("categorization_rules")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categorization-rules"] });
      toast({ title: "Regla eliminada" });
    },
  });

  const handleAdd = () => {
    if (!keyword || !categoria) {
      toast({
        title: "Error",
        description: "Palabra clave y categoría son requeridas",
        variant: "destructive",
      });
      return;
    }
    addRuleMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reglas de Categorización</CardTitle>
        <CardDescription>
          Define palabras clave para clasificar automáticamente tus transacciones
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="keyword">Palabra Clave</Label>
            <Input
              id="keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ej: FACEBOOK"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="categoria">Categoría</Label>
            <Input
              id="categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="ej: ADS_FACEBOOK"
              list="categorias"
            />
            <datalist id="categorias">
              {CATEGORIAS.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contrapartida">Contrapartida</Label>
            <Input
              id="contrapartida"
              value={contrapartida}
              onChange={(e) => setContrapartida(e.target.value)}
              placeholder="ej: FACEBOOK"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAdd} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Agregar Regla
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Palabra Clave</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Contrapartida</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No hay reglas definidas. Agrega tu primera regla arriba.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule: any) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-mono">{rule.keyword}</TableCell>
                    <TableCell className="font-mono text-sm">{rule.categoria}</TableCell>
                    <TableCell className="text-sm">{rule.contrapartida || "-"}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteRuleMutation.mutate(rule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
