import { Alert, Platform } from "react-native";

export function confirm(
	title: string,
	message: string,
	options: { confirmLabel?: string; destructive?: boolean } = {},
): Promise<boolean> {
	const { confirmLabel = "Confirm", destructive = false } = options;

	if (Platform.OS === "web") {
		return Promise.resolve(window.confirm(`${title}\n\n${message}`));
	}

	return new Promise((resolve) => {
		Alert.alert(
			title,
			message,
			[
				{ text: "Cancel", style: "cancel", onPress: () => resolve(false) },
				{
					text: confirmLabel,
					style: destructive ? "destructive" : "default",
					onPress: () => resolve(true),
				},
			],
			{ cancelable: false },
		);
	});
}
