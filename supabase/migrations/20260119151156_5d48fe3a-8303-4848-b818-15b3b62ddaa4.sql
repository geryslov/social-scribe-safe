-- Add user_id column to publishers to link publishers to auth users
ALTER TABLE publishers ADD COLUMN user_id UUID REFERENCES auth.users(id);
CREATE INDEX idx_publishers_user_id ON publishers(user_id);

-- Add unique constraint on user_id (one publisher per user)
ALTER TABLE publishers ADD CONSTRAINT publishers_user_id_unique UNIQUE (user_id);

-- Drop existing permissive update policy
DROP POLICY IF EXISTS "Anyone can update publishers" ON publishers;

-- Add user-specific policies
CREATE POLICY "Users can update own publisher" ON publishers
  FOR UPDATE USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));