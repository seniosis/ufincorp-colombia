-- Create fx_rates table for currency conversion
CREATE TABLE public.fx_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rate_date date NOT NULL,
  base_code text NOT NULL,
  quote_code text NOT NULL,
  rate numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(rate_date, base_code, quote_code)
);

-- Enable RLS for fx_rates
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

-- fx_rates policies: everyone can read, only authenticated users can insert/update
CREATE POLICY "fx_rates are viewable by everyone" 
ON public.fx_rates 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can insert fx_rates" 
ON public.fx_rates 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update fx_rates" 
ON public.fx_rates 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Create transactions_unified table
CREATE TABLE public.transactions_unified (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  fecha date NOT NULL,
  descripcion text NOT NULL,
  cuenta text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('in', 'out')),
  monto_original numeric NOT NULL,
  moneda text NOT NULL,
  monto_cop numeric NOT NULL,
  categoria text,
  contrapartida text,
  referencia text,
  notas text,
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS for transactions_unified
ALTER TABLE public.transactions_unified ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only see their own transactions
CREATE POLICY "Users can view their own transactions" 
ON public.transactions_unified 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions" 
ON public.transactions_unified 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transactions" 
ON public.transactions_unified 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transactions" 
ON public.transactions_unified 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates on transactions_unified
CREATE TRIGGER update_transactions_unified_updated_at
BEFORE UPDATE ON public.transactions_unified
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better query performance
CREATE INDEX idx_transactions_fecha ON public.transactions_unified(fecha DESC);
CREATE INDEX idx_transactions_user_id ON public.transactions_unified(user_id);
CREATE INDEX idx_transactions_categoria ON public.transactions_unified(categoria);
CREATE INDEX idx_transactions_cuenta ON public.transactions_unified(cuenta);

-- Insert some sample fx_rates for testing
INSERT INTO public.fx_rates (rate_date, base_code, quote_code, rate) VALUES
  ('2025-01-01', 'USD', 'COP', 4100),
  ('2025-01-01', 'AED', 'COP', 1120),
  (CURRENT_DATE, 'USD', 'COP', 4100),
  (CURRENT_DATE, 'AED', 'COP', 1120)
ON CONFLICT (rate_date, base_code, quote_code) DO NOTHING;