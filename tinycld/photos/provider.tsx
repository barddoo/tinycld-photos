import type { ReactNode } from "react";

interface Props {
	children: ReactNode;
}

export default function PhotosProvider({ children }: Props) {
	return <>{children}</>;
}
