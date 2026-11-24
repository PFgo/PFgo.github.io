self.onmessage = async ({data: blob}) => {
  try {
    const bitmap = await createImageBitmap(blob);
    self.postMessage(bitmap, [bitmap]);
  } catch {
    self.postMessage(null);
  }
};
