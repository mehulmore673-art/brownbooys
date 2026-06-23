// src/admin/useMenuActions.js
// ── Menu CRUD actions ─────────────────────────────────────────
import { useCallback } from "react";
import { adminFetch }  from "./adminFetch";

// ── Helper: upload a File object, return the hosted URL ──────
// Adjust the endpoint to match your backend's image-upload route.
// Backend is expected to return { url: "https://…" }
async function uploadImageFile(file) {
  const fd = new FormData();
  fd.append("image", file);
  const res = await adminFetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error("Image upload failed");
  const data = await res.json();
  return data.url;
}

/**
 * useMenuActions({ addToast, loadAll, setAddForm, setShowAddForm,
 *                  setEditingItem, EMPTY_FORM })
 * Returns: { submitAddItem, submitEditItem, deleteItem }
 */
export function useMenuActions({
  addToast,
  loadAll,
  setAddForm,
  setShowAddForm,
  setEditingItem,
  setVariantName,
  setVariantPrice,
  EMPTY_FORM,
}) {

  // ─────────────────────────────────────────────────────────────
  const submitAddItem = useCallback(async (addForm) => {
    if (!addForm.en.trim()) {
      addToast("⚠️ English name is required.", "warning"); return;
    }
    if (!addForm.variantsRaw.length && !addForm.price) {
      addToast("⚠️ Price required for items without variants.", "warning"); return;
    }

    // FIX #1 — resolve image: upload File first, fall back to URL
    let resolvedImage = "";
    if (addForm.imageFile) {
      try {
        resolvedImage = await uploadImageFile(addForm.imageFile);
      } catch (err) {
        addToast("❌ " + (err.message || "Image upload failed. Check server."), "error", 6000); return;
      }
    } else if (addForm.imageUrl) {
      resolvedImage = addForm.imageUrl;
    }

    const payload = {
      title: {
        en: addForm.en.trim(),
        hi: (addForm.hi || addForm.en).trim(),
        gu: (addForm.gu || addForm.en).trim(),
      },
      description:  addForm.description || "",
      isNew:        !!addForm.isNew,
      isBestseller: !!addForm.isBestseller,
      isHot:        !!addForm.isHot,
      isVeg:        addForm.isVeg !== false,
      available:    true,
    };

    if (addForm.variantsRaw.length) {
      payload.variants = addForm.variantsRaw.map((v) => ({
        name: {
          en: v.name?.en || "",
          hi: v.name?.hi || v.name?.en || "",
          gu: v.name?.gu || v.name?.en || "",
        },
        price: Number(v.price) || 0,
      }));
    } else {
      payload.price = Number(addForm.price) || 0;
    }

    if (resolvedImage)    payload.image    = resolvedImage;   // FIX #1
    if (addForm.rating)   payload.rating   = Number(addForm.rating);
    if (addForm.prepTime) payload.prepTime = Number(addForm.prepTime);
    if (addForm.category) payload.category = addForm.category;

    try {
      const res = await adminFetch("/api/menu", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) {
        const b = await res.json();
        addToast("❌ " + (b.error || "Failed to add item."), "error");
        return;
      }
      addToast(`✅ "${addForm.en}" added to menu.`, "success");
      setAddForm(EMPTY_FORM);
      setShowAddForm(false);
      setVariantName("");
      setVariantPrice("");
      loadAll();
    } catch (err) {
      addToast("📡 " + (err.message || "Server unreachable."), "error", 6000);
    }
  }, [addToast, loadAll, setAddForm, setShowAddForm, setVariantName, setVariantPrice, EMPTY_FORM]);

  // ─────────────────────────────────────────────────────────────
  const submitEditItem = useCallback(async (editingItem) => {
    if (!editingItem) return;

    // FIX — the edit form previously had no way to upload a new image
    // FILE, only paste a URL. Now mirrors submitAddItem: if the admin
    // picked a file (editingItem.imageFile), upload it to Cloudinary
    // first and use the returned URL; otherwise fall back to whatever
    // is in editingItem.image (existing image, or a manually typed URL).
    let resolvedImage = editingItem.image || "";
    if (editingItem.imageFile) {
      try {
        resolvedImage = await uploadImageFile(editingItem.imageFile);
      } catch (err) {
        addToast("❌ " + (err.message || "Image upload failed. Check server."), "error", 6000); return;
      }
    }

    const payload = {
      title: {
        en: editingItem.title?.en || "",
        hi: editingItem.title?.hi || editingItem.title?.en || "",
        gu: editingItem.title?.gu || editingItem.title?.en || "",
      },
      description:  editingItem.description  || "",
      isNew:        !!editingItem.isNew,
      isBestseller: !!editingItem.isBestseller,
      isHot:        !!editingItem.isHot,
      isVeg:        editingItem.isVeg  !== false,
      available:    editingItem.available !== false,
    };

    if (editingItem.variants?.length) {
      payload.variants = editingItem.variants.map((v) => ({
        name: {
          en: v.name?.en || "",
          hi: v.name?.hi || v.name?.en || "",
          gu: v.name?.gu || v.name?.en || "",
        },
        price: Number(v.price) || 0,
      }));
    } else {
      payload.price = Number(editingItem.price) || 0;
    }

    if (resolvedImage) payload.image = resolvedImage;

    try {
      const res = await adminFetch(`/api/menu/${editingItem.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) {
        const b = await res.json();
        addToast("❌ " + (b.error || "Failed to update item."), "error");
        return;
      }
      addToast(`✅ "${editingItem.title?.en}" updated.`, "success");
      setEditingItem(null);
      loadAll();
    } catch (err) {
      addToast("📡 " + (err.message || "Server unreachable."), "error", 6000);
    }
  }, [addToast, loadAll, setEditingItem]);

  // ─────────────────────────────────────────────────────────────
  const deleteItem = useCallback(async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      const res = await adminFetch(`/api/menu/${id}`, { method: "DELETE" });
      if (!res.ok) { addToast("❌ Failed to delete.", "error"); return; }
      addToast(`🗑️ "${name}" removed.`, "warning");
      loadAll();
    } catch (err) {
      addToast("📡 " + (err.message || "Server unreachable."), "error", 6000);
    }
  }, [addToast, loadAll]);

  return { submitAddItem, submitEditItem, deleteItem };
}
