// components/agendamento/AgendarFooter.tsx
"use client";

import type React from "react";
import { Button } from "@/components/ui/button";
import { DrawerClose } from "@/components/ui/drawer";

interface AgendarFooterProps {
  onAgendar: () => void;
  uploading: boolean;
}

const AgendarFooter: React.FC<AgendarFooterProps> = ({ onAgendar, uploading }) => {
  return (
    <div className="p-4 flex justify-end space-x-2 bg-background border-t border-border">
      <Button onClick={onAgendar} disabled={uploading}>
        {uploading ? "Enviando..." : "Agendar"}
      </Button>
      <DrawerClose asChild>
        <Button variant="outline" className="border-border hover:bg-accent">Cancelar</Button>
      </DrawerClose>
    </div>
  );
};

export default AgendarFooter;
