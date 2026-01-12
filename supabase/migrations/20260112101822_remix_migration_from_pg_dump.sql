CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'user'
);


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: document_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    user_id uuid,
    user_email text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_edit_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_edit_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    edited_by uuid,
    edited_by_email text NOT NULL,
    previous_content text NOT NULL,
    new_content text NOT NULL,
    previous_status text,
    new_status text,
    previous_title text,
    new_title text,
    edited_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    section_number integer NOT NULL,
    content text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    original_content text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    file_name text,
    file_url text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    notes text
);


--
-- Name: post_edit_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_edit_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    edited_by uuid,
    edited_by_email text NOT NULL,
    previous_content text NOT NULL,
    new_content text NOT NULL,
    previous_status text,
    new_status text,
    edited_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    scheduled_date date DEFAULT CURRENT_DATE NOT NULL,
    publisher_name text NOT NULL,
    publisher_role text,
    linkedin_url text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    labels text[] DEFAULT '{}'::text[],
    document_id uuid
);


--
-- Name: publishers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publishers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    role text,
    linkedin_url text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: section_edit_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.section_edit_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    document_id uuid NOT NULL,
    edited_by uuid,
    edited_by_email text NOT NULL,
    previous_content text NOT NULL,
    new_content text NOT NULL,
    previous_status text,
    new_status text,
    edited_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_comments document_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_comments
    ADD CONSTRAINT document_comments_pkey PRIMARY KEY (id);


--
-- Name: document_edit_history document_edit_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_edit_history
    ADD CONSTRAINT document_edit_history_pkey PRIMARY KEY (id);


--
-- Name: document_sections document_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_sections
    ADD CONSTRAINT document_sections_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: post_edit_history post_edit_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_edit_history
    ADD CONSTRAINT post_edit_history_pkey PRIMARY KEY (id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: publishers publishers_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publishers
    ADD CONSTRAINT publishers_name_key UNIQUE (name);


--
-- Name: publishers publishers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publishers
    ADD CONSTRAINT publishers_pkey PRIMARY KEY (id);


--
-- Name: section_edit_history section_edit_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_edit_history
    ADD CONSTRAINT section_edit_history_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: idx_document_comments_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_comments_document_id ON public.document_comments USING btree (document_id);


--
-- Name: idx_document_sections_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_sections_document_id ON public.document_sections USING btree (document_id);


--
-- Name: idx_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_status ON public.documents USING btree (status);


--
-- Name: idx_post_edit_history_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_edit_history_post_id ON public.post_edit_history USING btree (post_id);


--
-- Name: idx_posts_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_document_id ON public.posts USING btree (document_id);


--
-- Name: idx_posts_labels; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_labels ON public.posts USING gin (labels);


--
-- Name: document_sections update_document_sections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_document_sections_updated_at BEFORE UPDATE ON public.document_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: documents update_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: posts update_posts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: publishers update_publishers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_publishers_updated_at BEFORE UPDATE ON public.publishers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: document_comments document_comments_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_comments
    ADD CONSTRAINT document_comments_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_sections document_sections_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_sections
    ADD CONSTRAINT document_sections_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: post_edit_history post_edit_history_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_edit_history
    ADD CONSTRAINT post_edit_history_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: posts posts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: posts posts_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: document_sections Admins can create document sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create document sections" ON public.document_sections FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: documents Admins can create documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create documents" ON public.documents FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: posts Admins can create posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create posts" ON public.posts FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: document_sections Admins can delete document sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete document sections" ON public.document_sections FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: documents Admins can delete documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete documents" ON public.documents FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: posts Admins can delete posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete posts" ON public.posts FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: publishers Admins can delete publishers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete publishers" ON public.publishers FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: publishers Admins can insert publishers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert publishers" ON public.publishers FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: document_sections Admins can update document sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update document sections" ON public.document_sections FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: documents Admins can update documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update documents" ON public.documents FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: document_edit_history Admins can view document edit history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view document edit history" ON public.document_edit_history FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: post_edit_history Admins can view edit history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view edit history" ON public.post_edit_history FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: section_edit_history Admins can view section edit history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view section edit history" ON public.section_edit_history FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: document_comments Anyone can add comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can add comments" ON public.document_comments FOR INSERT WITH CHECK (true);


--
-- Name: document_edit_history Anyone can insert document edit history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert document edit history" ON public.document_edit_history FOR INSERT WITH CHECK (true);


--
-- Name: post_edit_history Anyone can insert edit history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert edit history" ON public.post_edit_history FOR INSERT WITH CHECK (true);


--
-- Name: section_edit_history Anyone can insert section edit history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert section edit history" ON public.section_edit_history FOR INSERT WITH CHECK (true);


--
-- Name: posts Anyone can update posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update posts" ON public.posts FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: publishers Anyone can update publishers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update publishers" ON public.publishers FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: document_comments Anyone can view comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view comments" ON public.document_comments FOR SELECT USING (true);


--
-- Name: document_sections Anyone can view document sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view document sections" ON public.document_sections FOR SELECT USING (true);


--
-- Name: documents Anyone can view documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view documents" ON public.documents FOR SELECT USING (true);


--
-- Name: posts Anyone can view posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view posts" ON public.posts FOR SELECT USING (true);


--
-- Name: publishers Anyone can view publishers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view publishers" ON public.publishers FOR SELECT USING (true);


--
-- Name: document_comments Users can delete their own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own comments" ON public.document_comments FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: document_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: document_edit_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_edit_history ENABLE ROW LEVEL SECURITY;

--
-- Name: document_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: post_edit_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_edit_history ENABLE ROW LEVEL SECURITY;

--
-- Name: posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

--
-- Name: publishers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.publishers ENABLE ROW LEVEL SECURITY;

--
-- Name: section_edit_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.section_edit_history ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;