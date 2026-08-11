create trigger inventory_items_sync_status
  before insert or update of quantity, low_stock_threshold
  on public.inventory_items
  for each row execute function private.sync_inventory_status();
