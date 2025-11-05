#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes, BytesN, Env};


/// Storage keys (placeholders)
mod keys {
    pub const ADDR: &[u8] = b"RES_ADDR";      // namehash -> Address
    pub const TEXT: &[u8] = b"RES_TEXT_";     // namespace prefix: TEXT || key || namehash -> String
    pub const REGISTRY: &[u8] = b"RES_REG";   // singleton: Address (Registry contract)
}

/// Events (placeholders)
#[derive(Clone)]
#[contracttype]
pub struct EvtAddressChanged {
    pub namehash: BytesN<32>,
    pub addr: Address,
}

#[derive(Clone)]
#[contracttype]
pub struct EvtTextChanged {
    pub namehash: BytesN<32>,
    pub key: Bytes,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracterror]
#[repr(u32)]
pub enum ResolverError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotOwner = 3,
    InvalidInput = 4,
}
fn registry_storage_key(env: &Env) -> Bytes {
    Bytes::from_slice(env, keys::REGISTRY)
}

#[contract]
pub struct Resolver;

#[contractimpl]
impl Resolver {
    /// Trivial export — replace with real constructor that sets Registry address.
    pub fn version(_env: Env) -> u32 {
        1
    }

    // --- Stubs to be implemented later ---
    // pub fn init(env: Env, registry: Address) { ... }
    // pub fn addr(env: Env, namehash: BytesN<32>) -> Address { ... }
    // pub fn set_addr(env: Env, namehash: BytesN<32>, addr: Address) { ... }
    // pub fn text(env: Env, namehash: BytesN<32>, key: Bytes) -> Option<Bytes> { ... }
    // pub fn set_text(env: Env, namehash: BytesN<32>, key: Bytes, value: Bytes) { ... }
    // Helper: verify ownership by querying Registry
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn it_compiles_and_returns_version() {
        let e = Env::default();
        let id = e.register(Resolver, ());
        let client = ResolverClient::new(&e, &id);
        assert_eq!(client.version(), 1);
    }
}
