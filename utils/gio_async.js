import Gio from "gi://Gio";

// Import this module to use the async Gio file functions with await. Being a
// module, it runs once however many files import it.

//NOTE: All of these throw exceptions because of their respective _finish functions
Gio._promisify(Gio.File.prototype, "load_contents_async", "load_contents_finish");
Gio._promisify(Gio.File.prototype, "make_directory_async", "make_directory_finish");
Gio._promisify(Gio.File.prototype, "enumerate_children_async", "enumerate_children_finish");

export default Gio;
