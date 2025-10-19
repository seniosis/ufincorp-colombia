-- Create table for custom categorization rules
CREATE TABLE public.categorization_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  keyword TEXT NOT NULL,
  categoria TEXT NOT NULL,
  contrapartida TEXT,
  priority INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.categorization_rules ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own rules"
ON public.categorization_rules
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own rules"
ON public.categorization_rules
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own rules"
ON public.categorization_rules
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own rules"
ON public.categorization_rules
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_categorization_rules_updated_at
BEFORE UPDATE ON public.categorization_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();