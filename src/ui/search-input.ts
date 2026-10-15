export function bindImeAwareSearch(
	input: HTMLInputElement,
	onCommit: (value: string) => void,
): void {
	let composing = false;
	let lastCommittedValue = input.value;

	const commit = (): void => {
		if (input.value === lastCommittedValue) return;
		lastCommittedValue = input.value;
		onCommit(input.value);
	};

	input.addEventListener('compositionstart', () => {
		composing = true;
	});
	input.addEventListener('compositionend', () => {
		composing = false;
		commit();
	});
	input.addEventListener('input', (event) => {
		if (composing || (event instanceof InputEvent && event.isComposing))
			return;
		commit();
	});
}
