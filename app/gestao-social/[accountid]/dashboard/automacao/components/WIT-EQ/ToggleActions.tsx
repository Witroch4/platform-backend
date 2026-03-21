// app/dashboard/automação/components/ToggleActions.tsx

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface Props {
	toggleValue: "publicar" | "comentarios" | "dm";
	setToggleValue: (val: "publicar" | "comentarios" | "dm") => void;
}

export default function ToggleActions({ toggleValue, setToggleValue }: Props) {
	return (
		<div style={{ marginTop: "30px" }}>
			<ToggleGroup type="single" value={toggleValue} onValueChange={(v) => v && setToggleValue(v as any)}>
				<ToggleGroupItem value="publicar">Publicar</ToggleGroupItem>
				<ToggleGroupItem value="comentarios">Comentários</ToggleGroupItem>
				<ToggleGroupItem value="dm">DM</ToggleGroupItem>
			</ToggleGroup>
		</div>
	);
}
