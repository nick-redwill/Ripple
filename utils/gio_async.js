import Gio from "gi://Gio";

// Import this module to use the async Gio file functions with await. Being a
// module, it runs once however many files import it.
Gio._promisify(Gio.File.prototype, "load_contents_async");
Gio._promisify(Gio.File.prototype, "make_directory_async");
Gio._promisify(Gio.File.prototype, "enumerate_children_async");

export default Gio;
