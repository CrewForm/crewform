-- SPDX-License-Identifier: AGPL-3.0-or-later
CREATE TABLE public.billing_checkout_requests (
 workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
 plan text NOT NULL CHECK(plan IN('pro','team')), token uuid NOT NULL DEFAULT gen_random_uuid(),
 session_id text,url text,expires_at timestamptz NOT NULL DEFAULT now()+interval '2 minutes'
);
ALTER TABLE public.billing_checkout_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_checkout_requests FROM anon,authenticated;
GRANT ALL ON public.billing_checkout_requests TO service_role;
CREATE FUNCTION public.reserve_billing_checkout(p_workspace_id uuid,p_plan text) RETURNS SETOF public.billing_checkout_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request public.billing_checkout_requests%ROWTYPE;
BEGIN
 PERFORM 1 FROM public.workspaces WHERE id=p_workspace_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown workspace'; END IF;
 SELECT * INTO v_request FROM public.billing_checkout_requests WHERE workspace_id=p_workspace_id;
 IF v_request.expires_at>now() THEN
  IF v_request.plan<>p_plan THEN RAISE EXCEPTION 'A checkout for another plan is already open'; END IF;
  IF v_request.url IS NULL THEN RAISE EXCEPTION 'Checkout is being prepared; retry shortly'; END IF;
  RETURN NEXT v_request; RETURN;
 END IF;
 INSERT INTO public.billing_checkout_requests(workspace_id,plan) VALUES(p_workspace_id,p_plan)
 ON CONFLICT(workspace_id) DO UPDATE SET plan=EXCLUDED.plan,token=gen_random_uuid(),session_id=NULL,url=NULL,expires_at=now()+interval '2 minutes'
 RETURNING * INTO v_request;
 RETURN NEXT v_request;
END;
$$;
CREATE FUNCTION public.bind_billing_checkout(p_workspace_id uuid,p_token uuid,p_session_id text,p_url text,p_expires_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.billing_checkout_requests SET session_id=p_session_id,url=p_url,expires_at=p_expires_at
 WHERE workspace_id=p_workspace_id AND token=p_token AND url IS NULL AND expires_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Checkout reservation expired'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_billing_checkout(uuid,text),public.bind_billing_checkout(uuid,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_billing_checkout(uuid,text),public.bind_billing_checkout(uuid,uuid,text,text,timestamptz) TO service_role;
