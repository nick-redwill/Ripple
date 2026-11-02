export function capitalizeWords(text) {
    return text.replace(/(^|\s)\S/g, letter => letter.toUpperCase());
}
