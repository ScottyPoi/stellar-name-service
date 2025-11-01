#![no_std]

#[cfg(test)]
extern crate std;

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env};

/// Storage key namespaces (placeholders for future data layout).
mod keys {
    pub const OWNER: &[u8] = b"REG_OWNER";     // namehash -> Address
    pub const RESOLVER: &[u8] = b"REG_RESOLV";  // namehash -> Address
    pub const EXPIRES: &[u8] = b"REG_EXPIRE";   // namehash -> u64
    pub const FLAGS: &[u8] = b"REG_FLAGS";      // namehash -> u32 (bitflags)
}

/// Event payload types (expand as needed).
#[derive(Clone)]
#[contracttype]
pub struct EvtTransfer {
    pub namehash: BytesN<32>,
    pub from: Address,
    pub to: Address,
}

#[derive(Clone)]
#[contracttype]
pub struct EvtResolverChanged {
    pub namehash: BytesN<32>,
    pub resolver: Address,
}

#[derive(Clone)]
#[contracttype]
pub struct EvtRenew {
    pub namehash: BytesN<32>,
    pub expires_at: u64,
}

#[contract]
pub struct Registry;

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Owner(BytesN<32>),
}

/// Minimal, compilable interface. Add real logic later.
#[contractimpl]
impl Registry {
    /// Trivial function so the contract exports at least one method.
    pub fn version(_env: Env) -> u32 {
        1
    }

    fn read_owner(env: &Env, namehash: &BytesN<32>) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Owner(namehash.clone()))
    }

    // --- Stubs to be implemented later ---
    pub fn set_owner(env: Env, namehash: BytesN<32>, new_owner: Address) {
        let key = DataKey::Owner(namehash.clone());
        let storage = env.storage().persistent();
        let current_owner: Option<Address> = storage.get(&key);

        match current_owner.as_ref() {
            Some(owner) => owner.require_auth(),
            None => new_owner.require_auth(),
        }

        env.storage().persistent().set(&key, &new_owner);

        let from = current_owner.unwrap_or_else(|| new_owner.clone());
        let transfer_evt = EvtTransfer {
            namehash,
            from,
            to: new_owner,
        };

        env.events()
            .publish((symbol_short!("transfer"), transfer_evt.namehash.clone()), transfer_evt);
    }
    // pub fn set_resolver(env: Env, namehash: BytesN<32>, resolver: Address) { ... }
    // pub fn transfer(env: Env, namehash: BytesN<32>, to: Address) { ... }
    // pub fn renew(env: Env, namehash: BytesN<32>) { ... }
    // pub fn owner(env: Env, namehash: BytesN<32>) -> Address { ... }
    // pub fn resolver(env: Env, namehash: BytesN<32>) -> Address { ... }
    // pub fn expires(env: Env, namehash: BytesN<32>) -> u64 { ... }
    // pub fn namehash(env: Env, labels: Vec<Bytes>) -> BytesN<32> { ... }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn it_compiles_and_returns_version() {
        let e = Env::default();
        let id = e.register(Registry, ());
        let client = RegistryClient::new(&e, &id);
        assert_eq!(client.version(), 1);
    }
}
