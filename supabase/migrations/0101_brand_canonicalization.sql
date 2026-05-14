create or replace function public.next_doc_number(
  p_brand public.brand,
  p_doc_family public.doc_family
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
  v_prefix text;
begin
  update public.doc_number_sequences
    set next_value = next_value + 1,
        updated_at = now()
    where brand = p_brand
      and doc_family = p_doc_family
    returning next_value - 1 into v_next;

  if v_next is null then
    raise exception 'missing doc_number_sequences row for %.%', p_brand, p_doc_family;
  end if;

  v_prefix :=
    case p_brand
      when 'hpusa' then 'HP'
      when 'vvs' then 'VVS'
      else upper(p_brand::text)
    end
    || '-'
    || case p_doc_family
      when 'deposit_invoice' then 'DI'
      when 'deposit_receipt' then 'DR'
      when 'sales_invoice' then 'SI'
      when 'sales_receipt' then 'SR'
      when 'quotation' then 'QT'
    end;

  return v_prefix || '-' || lpad(v_next::text, 6, '0');
end;
$$;
grant execute on function public.next_doc_number(public.brand, public.doc_family) to authenticated;
do $$
declare
  v_doc_number_conflicts integer;
  v_document_id_conflicts integer;
begin
  with transformed as (
    select
      d.id,
      d.brand,
      case
        when d.brand = 'hpusa' and d.doc_number like 'HPUSA-%'
          then regexp_replace(d.doc_number, '^HPUSA-', 'HP-')
        else d.doc_number
      end as next_doc_number,
      case
        when d.brand = 'hpusa' and d.document_id like 'DOC-HPUSA-%'
          then regexp_replace(d.document_id, '^DOC-HPUSA-', 'DOC-HP-')
        else d.document_id
      end as next_document_id
    from public.documents d
  )
  select count(*)
    into v_doc_number_conflicts
  from (
    select brand, next_doc_number
    from transformed
    group by brand, next_doc_number
    having count(*) > 1
  ) conflicts;

  with transformed as (
    select
      case
        when d.brand = 'hpusa' and d.document_id like 'DOC-HPUSA-%'
          then regexp_replace(d.document_id, '^DOC-HPUSA-', 'DOC-HP-')
        else d.document_id
      end as next_document_id
    from public.documents d
  )
  select count(*)
    into v_document_id_conflicts
  from (
    select next_document_id
    from transformed
    group by next_document_id
    having count(*) > 1
  ) conflicts;

  if v_doc_number_conflicts > 0 then
    raise exception 'brand canonicalization aborted: transformed doc_number collisions detected';
  end if;

  if v_document_id_conflicts > 0 then
    raise exception 'brand canonicalization aborted: transformed document_id collisions detected';
  end if;
end;
$$;
update public.documents
set
  doc_number = case
    when brand = 'hpusa' and doc_number like 'HPUSA-%'
      then regexp_replace(doc_number, '^HPUSA-', 'HP-')
    else doc_number
  end,
  document_id = case
    when brand = 'hpusa' and document_id like 'DOC-HPUSA-%'
      then regexp_replace(document_id, '^DOC-HPUSA-', 'DOC-HP-')
    else document_id
  end,
  updated_at = now()
where brand = 'hpusa'
  and (
    doc_number like 'HPUSA-%'
    or document_id like 'DOC-HPUSA-%'
  );
