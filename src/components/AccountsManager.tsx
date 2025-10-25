import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Account {
  id: string;
  nombre: string;
  tipo: string;
  moneda: string;
  saldo_actual: number;
  numero_cuenta?: string;
  entidad?: string;
  activa: boolean;
}

export function AccountsManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formData, setFormData] = useState({
    nombre: "",
    tipo: "bancaria",
    moneda: "COP",
    numero_cuenta: "",
    entidad: "",
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Account[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (accountData: typeof formData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const { error } = await supabase.from("accounts").insert({
        ...accountData,
        user_id: user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Cuenta creada exitosamente" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({ 
        title: "Error al crear cuenta", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...accountData }: Partial<Account>) => {
      const { error } = await supabase
        .from("accounts")
        .update(accountData)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Cuenta actualizada exitosamente" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({ 
        title: "Error al actualizar cuenta", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("accounts")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Cuenta eliminada exitosamente" });
    },
    onError: (error) => {
      toast({ 
        title: "Error al eliminar cuenta", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const resetForm = () => {
    setFormData({
      nombre: "",
      tipo: "bancaria",
      moneda: "COP",
      numero_cuenta: "",
      entidad: "",
    });
    setEditingAccount(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setFormData({
      nombre: account.nombre,
      tipo: account.tipo,
      moneda: account.moneda,
      numero_cuenta: account.numero_cuenta || "",
      entidad: account.entidad || "",
    });
    setIsDialogOpen(true);
  };

  const formatCOP = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Cuentas</CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Cuenta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingAccount ? "Editar Cuenta" : "Nueva Cuenta"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="nombre">Nombre de la Cuenta</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="tipo">Tipo de Cuenta</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                >
                  <SelectTrigger id="tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bancaria">Bancaria</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="billetera_digital">Billetera Digital</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="moneda">Moneda</Label>
                <Select
                  value={formData.moneda}
                  onValueChange={(value) => setFormData({ ...formData, moneda: value })}
                >
                  <SelectTrigger id="moneda">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COP">COP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="AED">AED</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="numero_cuenta">Número de Cuenta (Opcional)</Label>
                <Input
                  id="numero_cuenta"
                  value={formData.numero_cuenta}
                  onChange={(e) => setFormData({ ...formData, numero_cuenta: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="entidad">Entidad (Opcional)</Label>
                <Input
                  id="entidad"
                  value={formData.entidad}
                  onChange={(e) => setFormData({ ...formData, entidad: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full">
                {editingAccount ? "Actualizar" : "Crear"} Cuenta
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p>Cargando cuentas...</p>
        ) : accounts && accounts.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Entidad</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.nombre}</TableCell>
                  <TableCell className="capitalize">{account.tipo}</TableCell>
                  <TableCell>{account.moneda}</TableCell>
                  <TableCell>
                    {account.moneda === "COP" 
                      ? formatCOP(account.saldo_actual) 
                      : `${account.moneda} ${account.saldo_actual.toFixed(2)}`}
                  </TableCell>
                  <TableCell>{account.entidad || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(account)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(account.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            No tienes cuentas registradas. Crea tu primera cuenta.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
